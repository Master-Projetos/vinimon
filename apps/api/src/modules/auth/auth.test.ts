import { createHash, randomBytes, scryptSync } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarUsuario, headersDe, limparBanco, ORIGEM, SENHA_TESTE } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

const JSON_HDR = { 'content-type': 'application/json' }
const cookieDe = (res: { headers: Record<string, unknown> }): string => {
  const sc = res.headers['set-cookie']
  const linha = Array.isArray(sc) ? sc[0] : sc
  return String(linha ?? '')
}

describe('módulo auth', () => {
  let app: App
  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(limparBanco)

  const entrar = (login: string, senha: string, origin: string | null = ORIGEM) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...JSON_HDR, ...(origin ? { origin } : {}) },
      payload: { login, senha },
    })

  it('USUARIO entra direto em ATIVA e recebe csrf e permissões (T05, T18)', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const res = await entrar(u.login, SENHA_TESTE)
    expect(res.statusCode).toBe(200)
    const corpo = res.json()
    expect(corpo.estado).toBe('ATIVA')
    expect(corpo.csrf).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(corpo.usuario).toMatchObject({ id: u.id, perfil: 'USUARIO', mfaAtivo: false })
    expect(corpo.usuario.permissoes).toContain('chamado.abrir')
    expect(JSON.stringify(corpo)).not.toMatch(/senhaHash|senha_hash|\$argon2/i)

    // T05: a senha está gravada como argon2id com os parâmetros da S7
    const [linha] = await prisma.$queryRaw<{ senha_hash: string }[]>`SELECT senha_hash FROM usuarios WHERE id = ${u.id}`
    expect(linha?.senha_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)

    // T18: o cookie é o token; o banco guarda só o sha256
    const set = cookieDe(res)
    const token = /vinimon_sid=([^;]+)/.exec(set)?.[1] ?? ''
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const sessao = await prisma.sessao.findFirstOrThrow({
      where: { usuarioId: u.id },
      select: { tokenHash: true, estado: true },
    })
    expect(sessao.estado).toBe('ATIVA')
    expect(sessao.tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(sessao.tokenHash).not.toBe(token)
    expect(set).toMatch(/HttpOnly/i)
    expect(set).toMatch(/SameSite=Strict/i)
    expect(set).toMatch(/Path=\//)
    expect(set).not.toMatch(/Domain=/i)
  })

  it('equipe sem 2FA cai em CADASTRO_MFA e não recebe o usuário completo (S26)', async () => {
    const op = await criarUsuario({ perfil: 'OPERADOR' })
    const res = await entrar(op.login, SENHA_TESTE)
    expect(res.json()).toMatchObject({ estado: 'CADASTRO_MFA', usuario: null })
  })

  it('deveTrocarSenha tem prioridade sobre o cadastro de 2FA', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    await prisma.usuario.update({ where: { id: admin.id }, data: { deveTrocarSenha: true } })
    expect((await entrar(admin.login, SENHA_TESTE)).json().estado).toBe('TROCA_SENHA')
  })

  it('T12: o login é normalizado (ADMIN → admin)', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    await prisma.usuario.update({ where: { id: u.id }, data: { login: 'admin' } })
    expect((await entrar('  ADMIN ', SENHA_TESTE)).statusCode).toBe(200)
  })

  it('login inexistente, usuário inativo e senha errada dão a mesma resposta e registram falha', async () => {
    const ativo = await criarUsuario({ perfil: 'USUARIO' })
    const inativo = await criarUsuario({ perfil: 'USUARIO', ativo: false })
    const respostas = [
      await entrar('naoexiste', SENHA_TESTE),
      await entrar(inativo.login, SENHA_TESTE),
      await entrar(ativo.login, 'senha-errada-123'),
    ]
    for (const r of respostas) {
      expect(r.statusCode).toBe(401)
      expect(r.json().erro).toMatchObject({ codigo: 'NAO_AUTENTICADO', mensagem: 'Login ou senha inválidos.' })
    }
    expect(await prisma.falhaLogin.count()).toBe(3)
    expect(await prisma.sessao.count()).toBe(0)
  })

  it('T06: hash legado da v1 confere, migra para argon2id e audita senha.migrada', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const saltHex = randomBytes(16).toString('hex')
    const legado = `${saltHex}:${scryptSync('abc-legado-123', saltHex, 64).toString('hex')}`
    await prisma.$executeRaw`UPDATE usuarios SET senha_hash = ${legado} WHERE id = ${u.id}`

    expect((await entrar(u.login, 'errada-errada')).statusCode).toBe(401)
    const [intacto] = await prisma.$queryRaw<
      { senha_hash: string }[]
    >`SELECT senha_hash FROM usuarios WHERE id = ${u.id}`
    expect(intacto?.senha_hash).toBe(legado)
    expect(await prisma.auditoria.count({ where: { acao: 'senha.migrada' } })).toBe(0)

    expect((await entrar(u.login, 'abc-legado-123')).statusCode).toBe(200)
    const [novo] = await prisma.$queryRaw<{ senha_hash: string }[]>`SELECT senha_hash FROM usuarios WHERE id = ${u.id}`
    expect(novo?.senha_hash).toMatch(/^\$argon2id\$/)
    expect(await prisma.auditoria.count({ where: { acao: 'senha.migrada', entidadeId: String(u.id) } })).toBe(1)
  })

  it('T14: senha de 10.000 caracteres dá 400 sem gravar falha; corpo de 2 MB dá 413', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const longa = await entrar(u.login, 'a'.repeat(10_000))
    expect(longa.statusCode).toBe(400)
    expect(await prisma.falhaLogin.count()).toBe(0)
    const enorme = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...JSON_HDR, origin: ORIGEM },
      payload: JSON.stringify({ login: u.login, senha: 'x'.repeat(2 * 1024 * 1024) }),
    })
    expect(enorme.statusCode).toBe(413)
  })

  it('S32: login sem Origin e sem Sec-Fetch-Site, ou de outra origem, dá 403', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    expect((await entrar(u.login, SENHA_TESTE, null)).statusCode).toBe(403)
    expect((await entrar(u.login, SENHA_TESTE, 'https://evil.test')).statusCode).toBe(403)
    expect((await entrar(u.login, SENHA_TESTE, 'null')).statusCode).toBe(403)
    const mesmoSite = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...JSON_HDR, 'sec-fetch-site': 'same-origin' },
      payload: { login: u.login, senha: SENHA_TESTE },
    })
    expect(mesmoSite.statusCode).toBe(200)
  })

  it('GET /auth/sessao devolve estado, csrf e usuário; logout revoga e limpa o cookie', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const headers = await headersDe(u.id)
    const sessao = await app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers })
    expect(sessao.statusCode).toBe(200)
    expect(sessao.json()).toMatchObject({ estado: 'ATIVA', usuario: { id: u.id } })

    const sem = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin: ORIGEM } })
    expect(sem.statusCode).toBe(401)

    const sair = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers })
    expect(sair.statusCode).toBe(204)
    expect(cookieDe(sair)).toMatch(/vinimon_sid=;/)
    expect(
      await prisma.sessao.count({ where: { usuarioId: u.id, revogadaEm: { not: null }, motivoRevogacao: 'logout' } }),
    ).toBe(1)
    expect(await prisma.auditoria.count({ where: { acao: 'logout' } })).toBe(1)
    expect((await app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers })).statusCode).toBe(401)
  })

  it('T23: cookie e Authorization juntos dão 400; cookie malformado dá 401', async () => {
    const juntos = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessao',
      headers: { cookie: `vinimon_sid=${'a'.repeat(43)}`, authorization: 'Bearer x' },
    })
    expect(juntos.statusCode).toBe(400)
    for (const cookie of ['vinimon_sid=%E0', 'vinimon_sid=curto', `vinimon_sid=${'!'.repeat(43)}`]) {
      const r = await app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers: { cookie } })
      expect(r.statusCode).toBe(401)
    }
  })

  it('T28: mutação autenticada sem token CSRF, ou com o de outra sessão, dá 403', async () => {
    const a = await criarUsuario({ perfil: 'USUARIO' })
    const b = await criarUsuario({ perfil: 'USUARIO' })
    const ha = await headersDe(a.id)
    const hb = await headersDe(b.id)
    const semToken = { cookie: ha.cookie, origin: ORIGEM }
    const deOutro = { cookie: ha.cookie, origin: ORIGEM, 'x-csrf-token': hb['x-csrf-token'] }
    for (const headers of [semToken, deOutro]) {
      const r = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers })
      expect(r.statusCode).toBe(403)
      expect(r.json().erro.codigo).toBe('CSRF_INVALIDO')
    }
  })
})

describe('T17: cookie em https', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('T17: usa __Host-vinimon_sid com Secure, HttpOnly, SameSite=Strict, Path=/ e sem Domain', async () => {
    await limparBanco()
    const u = await criarUsuario({ perfil: 'USUARIO' })
    vi.stubEnv('APP_ORIGIN', 'https://vinimon.test')
    vi.resetModules()
    const { buildApp: buildHttps } = await import('../../app')
    const { prisma: prismaHttps } = await import('../../lib/prisma')
    const appHttps = await buildHttps({ logger: false })
    try {
      const res = await appHttps.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { ...JSON_HDR, origin: 'https://vinimon.test' },
        payload: { login: u.login, senha: SENHA_TESTE },
      })
      expect(res.statusCode).toBe(200)
      const set = cookieDe(res)
      expect(set).toMatch(/^__Host-vinimon_sid=/)
      expect(set).toMatch(/; Secure/i)
      expect(set).toMatch(/HttpOnly/i)
      expect(set).toMatch(/SameSite=Strict/i)
      expect(set).toMatch(/Path=\//)
      expect(set).not.toMatch(/Domain=/i)
    } finally {
      await appHttps.close()
      await prismaHttps.$disconnect()
    }
  })
})
