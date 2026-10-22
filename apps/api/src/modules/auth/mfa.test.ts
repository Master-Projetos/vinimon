import { generate } from 'otplib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ativarMfa,
  criarUsuario,
  headersComToken,
  headersDe,
  limparBanco,
  ORIGEM,
  SENHA_TESTE,
  tokenDoCookie,
} from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

const JSON_HDR = { 'content-type': 'application/json' }

describe('2FA no login (T24, T26, T27)', () => {
  let app: App
  // Um app por teste: o rate limit (em memória, por usuário) não pode vazar entre testes, que reaproveitam os mesmos ids.
  beforeEach(async () => {
    await limparBanco()
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const entrar = (login: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...JSON_HDR, origin: ORIGEM },
      payload: { login, senha: SENHA_TESTE },
    })
  const verificar = (headers: Record<string, string>, payload: object) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/2fa/verificar', headers: { ...JSON_HDR, ...headers }, payload })

  async function loginPendente(perfil: 'ADMIN' | 'OPERADOR' | 'USUARIO' = 'OPERADOR') {
    const u = await criarUsuario({ perfil })
    const mfa = await ativarMfa(u.id)
    const res = await entrar(u.login)
    const corpo = res.json()
    expect(corpo).toMatchObject({ estado: 'PENDENTE_MFA', usuario: null })
    const token = tokenDoCookie(res)
    return { u, mfa, token, csrf: corpo.csrf as string, headers: headersComToken(token, corpo.csrf) }
  }

  it('T24: equipe sem 2FA cai em CADASTRO_MFA e as rotas protegidas dão 403 MFA_PENDENTE', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await entrar(admin.login)
    expect(res.json().estado).toBe('CADASTRO_MFA')
    const areas = await app.inject({
      method: 'GET',
      url: '/api/v1/areas',
      headers: { cookie: `vinimon_sid=${tokenDoCookie(res)}` },
    })
    expect(areas.statusCode).toBe(403)
    expect(areas.json().erro.codigo).toBe('MFA_PENDENTE')
  })

  it('com 2FA ativo o login pede o código; sessão pendente não acessa nada', async () => {
    const { token } = await loginPendente('ADMIN')
    const r = await app.inject({ method: 'GET', url: '/api/v1/areas', headers: { cookie: `vinimon_sid=${token}` } })
    expect(r.statusCode).toBe(403)
    expect(r.json().erro.codigo).toBe('MFA_PENDENTE')
  })

  it('código correto → ATIVA, cookie novo (o antigo morre) e último passo gravado (S19, S28)', async () => {
    const { u, mfa, token, headers } = await loginPendente()
    const res = await verificar(headers, { codigo: await generate({ secret: mfa.secret }) })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ estado: 'ATIVA', usuario: { id: u.id, mfaAtivo: true } })

    const novo = tokenDoCookie(res)
    expect(novo).not.toBe(token)
    const sessao = (t: string) =>
      app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers: { cookie: `vinimon_sid=${t}` } })
    expect((await sessao(token)).statusCode).toBe(401)
    expect((await sessao(novo)).statusCode).toBe(200)
    const depois = await prisma.usuario.findUniqueOrThrow({
      where: { id: u.id },
      select: { totpUltimoPasso: true, ultimoLoginEm: true },
    })
    expect(depois.totpUltimoPasso).not.toBeNull()
    expect(depois.ultimoLoginEm).not.toBeNull()
  })

  it('T26: o mesmo código no mesmo passo é recusado numa segunda sessão', async () => {
    const { u, mfa, headers } = await loginPendente()
    const codigo = await generate({ secret: mfa.secret })
    expect((await verificar(headers, { codigo })).statusCode).toBe(200)

    const segundo = await entrar(u.login)
    const h2 = headersComToken(tokenDoCookie(segundo), segundo.json().csrf)
    const reuso = await verificar(h2, { codigo })
    expect(reuso.statusCode).toBe(401)
    expect(reuso.json().erro.codigo).toBe('NAO_AUTENTICADO')
  })

  it('T26: 5 códigos errados revogam a sessão pendente e contam em falhas_login', async () => {
    const { u, headers, token } = await loginPendente()
    for (let i = 0; i < 5; i++) expect((await verificar(headers, { codigo: '000000' })).statusCode).toBe(401)
    expect(await prisma.sessao.count({ where: { usuarioId: u.id, motivoRevogacao: 'mfa_falhas' } })).toBe(1)
    expect(await prisma.falhaLogin.count({ where: { loginNormalizado: u.login } })).toBe(5)
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessao',
      headers: { cookie: `vinimon_sid=${token}` },
    })
    expect(r.statusCode).toBe(401)
  })

  it('T27: o código de recuperação funciona uma vez e é auditado', async () => {
    const { u, mfa, headers } = await loginPendente()
    const codigo = mfa.codigos[0] ?? ''
    const ok = await verificar(headers, { codigoRecuperacao: codigo.toLowerCase() })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().estado).toBe('ATIVA')
    expect(await prisma.auditoria.count({ where: { acao: 'mfa.recuperacaoUsada', entidadeId: String(u.id) } })).toBe(1)

    const segundo = await entrar(u.login)
    const h2 = headersComToken(tokenDoCookie(segundo), segundo.json().csrf)
    expect((await verificar(h2, { codigoRecuperacao: codigo })).statusCode).toBe(401)
  })

  it('depois do 2FA, deveTrocarSenha leva a TROCA_SENHA (ordem da S26)', async () => {
    const { u, mfa, headers } = await loginPendente('ADMIN')
    await prisma.usuario.update({ where: { id: u.id }, data: { deveTrocarSenha: true } })
    const res = await verificar(headers, { codigo: await generate({ secret: mfa.secret }) })
    expect(res.json()).toMatchObject({ estado: 'TROCA_SENHA', usuario: null })
  })

  it('corpo com os dois campos, ou sem nenhum, dá 400', async () => {
    const { headers } = await loginPendente()
    expect((await verificar(headers, { codigo: '123456', codigoRecuperacao: 'x' })).statusCode).toBe(400)
    expect((await verificar(headers, {})).statusCode).toBe(400)
    expect((await verificar(headers, { codigo: '12345' })).statusCode).toBe(400)
  })

  it('a rota só aceita sessões PENDENTE_MFA', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    await ativarMfa(u.id)
    const r = await verificar(await headersDe(u.id), { codigo: '123456' })
    expect(r.statusCode).toBe(403)
  })
})
