import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type App, buildApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { criarUsuario, limparBanco, ORIGEM, SENHA_TESTE } from './ajudantes'

const JSON_HDR = { 'content-type': 'application/json' }

describe('bloqueio de login, rate limit e IP', () => {
  let app: App
  beforeEach(async () => {
    await limparBanco()
    app = await buildApp({ logger: false }) // um app por teste: o rate limit em memória começa zerado
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const entrar = (
    login: string,
    senha: string,
    extra: { remoteAddress?: string; headers?: Record<string, string> } = {},
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: extra.remoteAddress,
      headers: { ...JSON_HDR, origin: ORIGEM, ...extra.headers },
      payload: { login, senha },
    })

  it('T13: a 6ª tentativa dá 429 mesmo com a senha certa, e também para login inexistente', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    for (let i = 0; i < 5; i++) expect((await entrar(u.login, 'errada-errada-1')).statusCode).toBe(401)
    const certa = await entrar(u.login, SENHA_TESTE)
    expect(certa.statusCode).toBe(429)
    expect(certa.json().erro.codigo).toBe('MUITAS_TENTATIVAS')
    expect(await prisma.sessao.count()).toBe(0)

    for (let i = 0; i < 5; i++) await entrar('fantasma', 'qualquer-coisa-1')
    expect((await entrar('fantasma', 'qualquer-coisa-1')).statusCode).toBe(429)
  })

  it('T13: depois de 16 min sem novas falhas o login volta a funcionar e as falhas são apagadas', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    for (let i = 0; i < 5; i++) await entrar(u.login, 'errada-errada-1')
    expect((await entrar(u.login, SENHA_TESTE)).statusCode).toBe(429)
    await prisma.falhaLogin.updateMany({ data: { criadoEm: new Date(Date.now() - 16 * 60_000) } })
    expect((await entrar(u.login, SENHA_TESTE)).statusCode).toBe(200)
    expect(await prisma.falhaLogin.count({ where: { loginNormalizado: u.login } })).toBe(0)
  })

  it('S40: cruzar 5 falhas grava a auditoria login.bloqueado uma única vez', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    for (let i = 0; i < 6; i++) await entrar(u.login, 'errada-errada-1')
    expect(await prisma.auditoria.count({ where: { acao: 'login.falha' } })).toBe(5)
    expect(await prisma.auditoria.count({ where: { acao: 'login.bloqueado', entidadeId: String(u.id) } })).toBe(1)
  })

  it('T16: a 11ª requisição de login no minuto dá 429', async () => {
    const codigos: number[] = []
    for (let i = 0; i < 11; i++) codigos.push((await entrar(`fantasma${i}`, 'qualquer-coisa-1')).statusCode)
    expect(codigos.slice(0, 10).every((c) => c === 401)).toBe(true)
    expect(codigos[10]).toBe(429)
  })

  it('T16: 30 falhas do mesmo IP, em vários logins, bloqueiam o IP', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    await prisma.falhaLogin.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({ loginNormalizado: `outro${i}`, ip: '127.0.0.1' })),
    })
    const r = await entrar(u.login, SENHA_TESTE)
    expect(r.statusCode).toBe(429)
    expect(r.json().erro.mensagem).toMatch(/endereço/)
  })
})

describe('T15: IP real atrás de proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function ipRegistrado(trustProxy: string | undefined, remoteAddress: string): Promise<string | undefined> {
    await limparBanco()
    if (trustProxy !== undefined) vi.stubEnv('TRUST_PROXY', trustProxy)
    vi.resetModules()
    const { buildApp: build } = await import('../src/app')
    const { prisma: p } = await import('../src/lib/prisma')
    const a = await build({ logger: false })
    try {
      await a.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        remoteAddress,
        headers: { ...JSON_HDR, origin: ORIGEM, 'x-forwarded-for': '203.0.113.9' },
        payload: { login: 'fantasma', senha: 'qualquer-coisa-1' },
      })
      return (await p.falhaLogin.findFirst({ select: { ip: true } }))?.ip
    } finally {
      await a.close()
      await p.$disconnect()
    }
  }

  it('T15: ignora X-Forwarded-For sem TRUST_PROXY', async () => {
    expect(await ipRegistrado('false', '127.0.0.1')).toBe('127.0.0.1')
  })

  it('respeita X-Forwarded-For quando o remoto é o proxy confiável', async () => {
    expect(await ipRegistrado('127.0.0.1', '127.0.0.1')).toBe('203.0.113.9')
  })

  it('ignora X-Forwarded-For de quem não é o proxy confiável', async () => {
    expect(await ipRegistrado('127.0.0.1', '10.0.0.5')).toBe('10.0.0.5')
  })
})
