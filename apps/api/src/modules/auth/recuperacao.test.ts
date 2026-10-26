import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco, ORIGEM, SENHA_TESTE } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { invalidarConfig } from '../../lib/config'
import { prisma } from '../../lib/prisma'

const JSON_HDR = { 'content-type': 'application/json', origin: ORIGEM }
const NOVA = 'Pitanga-Lanterna-Rio-2027'
const sha256 = (t: string) => createHash('sha256').update(t).digest('hex')

describe('recuperação de senha (SEN-10, S20)', () => {
  let app: App
  beforeEach(async () => {
    await limparBanco()
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const habilitarEmail = async () => {
    await prisma.config.upsert({
      where: { chave: 'email.habilitado' },
      create: { chave: 'email.habilitado', valor: true },
      update: { valor: true },
    })
    invalidarConfig()
  }
  const esqueci = (login: string) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/esqueci-senha', headers: JSON_HDR, payload: { login } })
  const redefinir = (token: string, novaSenha: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/redefinir-senha',
      headers: JSON_HDR,
      payload: { token, novaSenha },
    })
  /** Pede o link e devolve o token em claro, lido do e-mail da outbox (o banco só tem o hash). */
  const pedirToken = async (login: string): Promise<string> => {
    expect((await esqueci(login)).statusCode).toBe(202)
    const email = await prisma.emailSaida.findFirstOrThrow({ orderBy: { id: 'desc' }, select: { texto: true } })
    const m = /redefinir-senha\?token=([\w-]+)/.exec(email.texto)
    if (!m?.[1]) throw new Error('link ausente no e-mail')
    return m[1]
  }

  it('GET /auth/recuperacao é público e informa só se o e-mail está habilitado', async () => {
    const antes = await app.inject({ method: 'GET', url: '/api/v1/auth/recuperacao' })
    expect(antes.statusCode).toBe(200)
    expect(antes.json()).toEqual({ habilitada: false })
    await habilitarEmail()
    const depois = await app.inject({ method: 'GET', url: '/api/v1/auth/recuperacao' })
    expect(depois.json()).toEqual({ habilitada: true })
  })

  it('login inexistente e existente recebem a mesma resposta', async () => {
    await habilitarEmail()
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const existente = await esqueci(u.login)
    const inexistente = await esqueci('ninguem.assim')
    expect(existente.statusCode).toBe(202)
    expect(inexistente.statusCode).toBe(202)
    expect(existente.json()).toEqual(inexistente.json())
    expect(existente.json()).toEqual({ mensagem: 'Se o login existir, enviaremos instruções' })
    expect(await prisma.emailSaida.count()).toBe(1)
  })

  it('não enfileira (e responde igual) sem email.habilitado, sem e-mail ou com usuário inativo', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const desligado = await esqueci(u.login)
    expect(desligado.statusCode).toBe(202)

    await habilitarEmail()
    const semEmail = await criarUsuario({ perfil: 'USUARIO' })
    await prisma.usuario.update({ where: { id: semEmail.id }, data: { email: null } })
    const inativo = await criarUsuario({ perfil: 'USUARIO', ativo: false })
    const r1 = await esqueci(semEmail.login)
    const r2 = await esqueci(inativo.login)
    expect(r1.json()).toEqual(desligado.json())
    expect(r2.json()).toEqual(desligado.json())
    expect(await prisma.emailSaida.count()).toBe(0)
    expect(await prisma.tokenSenha.count()).toBe(0)
  })

  it('token válido troca a senha, revoga as sessões e audita senha.redefinida', async () => {
    await habilitarEmail()
    const u = await criarUsuario({ perfil: 'USUARIO' })
    await headersDe(u.id)
    await headersDe(u.id)
    const token = await pedirToken(u.login)

    const r = await redefinir(token, NOVA)
    expect(r.statusCode).toBe(204)
    expect(await prisma.sessao.count({ where: { usuarioId: u.id, revogadaEm: null } })).toBe(0)
    expect(await prisma.sessao.count({ where: { usuarioId: u.id, motivoRevogacao: 'senha_redefinida' } })).toBe(2)
    expect(await prisma.auditoria.count({ where: { acao: 'senha.redefinida', entidadeId: String(u.id) } })).toBe(1)
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: JSON_HDR,
      payload: { login: u.login, senha: NOVA },
    })
    expect(login.statusCode).toBe(200)
    const antiga = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: JSON_HDR,
      payload: { login: u.login, senha: SENHA_TESTE },
    })
    expect(antiga.statusCode).toBe(401)
  })

  it('token usado dá 400 com mensagem genérica', async () => {
    await habilitarEmail()
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const token = await pedirToken(u.login)
    expect((await redefinir(token, NOVA)).statusCode).toBe(204)
    const de_novo = await redefinir(token, NOVA + 'x')
    expect(de_novo.statusCode).toBe(400)
    expect(de_novo.json().erro.mensagem).toBe('Link inválido ou expirado')
  })

  it('token expirado dá 400', async () => {
    await habilitarEmail()
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const token = await pedirToken(u.login)
    await prisma.tokenSenha.updateMany({ where: { usuarioId: u.id }, data: { expiraEm: new Date(Date.now() - 1000) } })
    const r = await redefinir(token, NOVA)
    expect(r.statusCode).toBe(400)
    expect(r.json().erro.mensagem).toBe('Link inválido ou expirado')
  })

  it('token inexistente dá 400', async () => {
    const r = await redefinir('token-que-nunca-existiu', NOVA)
    expect(r.statusCode).toBe(400)
    expect(r.json().erro.mensagem).toBe('Link inválido ou expirado')
  })

  it('senha fraca dá 400 com detalhes e não consome o token', async () => {
    await habilitarEmail()
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const token = await pedirToken(u.login)
    const r = await redefinir(token, 'senha123')
    expect(r.statusCode).toBe(400)
    expect(r.json().erro.detalhes[0].campo).toBe('novaSenha')
    expect(await prisma.tokenSenha.count({ where: { usadoEm: null } })).toBe(1)
  })

  it('um novo pedido invalida o token anterior', async () => {
    await habilitarEmail()
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const primeiro = await pedirToken(u.login)
    const segundo = await pedirToken(u.login)
    expect((await redefinir(primeiro, NOVA)).statusCode).toBe(400)
    expect((await redefinir(segundo, NOVA)).statusCode).toBe(204)
  })

  it('429 no 4º pedido na hora', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    for (let i = 0; i < 3; i++) expect((await esqueci(u.login)).statusCode).toBe(202)
    expect((await esqueci(u.login)).statusCode).toBe(429)
  })

  it('429 por login mesmo com IPs diferentes', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const de = (ip: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/esqueci-senha',
        headers: JSON_HDR,
        remoteAddress: ip,
        payload: { login: u.login },
      })
    for (const ip of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) expect((await de(ip)).statusCode).toBe(202)
    expect((await de('10.0.0.4')).statusCode).toBe(429)
  })

  it('400 com corpo inválido', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/esqueci-senha',
      headers: JSON_HDR,
      payload: { login: 'abc', extra: 1 },
    })
    expect(r.statusCode).toBe(400)
  })

  it('nada do token em claro no banco', async () => {
    await habilitarEmail()
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const token = await pedirToken(u.login)
    const t = await prisma.tokenSenha.findFirstOrThrow({ where: { usuarioId: u.id } })
    expect(t.tokenHash).toBe(sha256(token))
    expect(t.tokenHash).toHaveLength(64)
    expect(JSON.stringify(t)).not.toContain(token)
    const audit = await prisma.auditoria.findMany({ select: { dados: true, acao: true } })
    expect(JSON.stringify(audit)).not.toContain(token)
  })
})
