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

describe('cadastro do 2FA (T25, T27)', () => {
  let app: App
  beforeEach(async () => {
    await limparBanco()
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const post = (url: string, headers: Record<string, string>, payload?: object) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/auth/${url}`,
      headers: { ...(payload ? JSON_HDR : {}), ...headers },
      payload,
    })

  async function adminEmCadastro() {
    const u = await criarUsuario({ perfil: 'ADMIN' })
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...JSON_HDR, origin: ORIGEM },
      payload: { login: u.login, senha: SENHA_TESTE },
    })
    expect(login.json().estado).toBe('CADASTRO_MFA')
    return { u, token: tokenDoCookie(login), headers: headersComToken(tokenDoCookie(login), login.json().csrf) }
  }

  it('T25: iniciar guarda o segredo cifrado e confirmar ativa o 2FA, devolvendo 10 códigos uma só vez', async () => {
    const { u, token, headers } = await adminEmCadastro()
    const outra = await headersDe(u.id) // outra sessão do mesmo usuário

    const ini = await post('2fa/iniciar', headers)
    expect(ini.statusCode).toBe(200)
    const { segredo, otpauthUri } = ini.json()
    expect(otpauthUri).toMatch(/^otpauth:\/\/totp\/.*issuer=Vinimon/)
    const [pend] = await prisma.$queryRaw<
      { totp_secret_pendente_enc: string }[]
    >`SELECT totp_secret_pendente_enc FROM usuarios WHERE id = ${u.id}`
    expect(pend?.totp_secret_pendente_enc).toMatch(/^v1:/)
    expect(pend?.totp_secret_pendente_enc).not.toContain(segredo)

    const conf = await post('2fa/confirmar', headers, { codigo: await generate({ secret: segredo }) })
    expect(conf.statusCode).toBe(200)
    const corpo = conf.json()
    expect(corpo.codigos).toHaveLength(10)
    expect(corpo.sessao).toMatchObject({ estado: 'ATIVA', usuario: { id: u.id, mfaAtivo: true } })

    const [ativo] = await prisma.$queryRaw<
      { totp_secret_enc: string }[]
    >`SELECT totp_secret_enc FROM usuarios WHERE id = ${u.id}`
    expect(ativo?.totp_secret_enc).toMatch(/^v1:/)
    expect(ativo?.totp_secret_enc).not.toContain(segredo)
    const hashes = await prisma.codigoRecuperacao.findMany({ where: { usuarioId: u.id }, select: { codigoHash: true } })
    expect(hashes).toHaveLength(10)
    for (const c of corpo.codigos) expect(JSON.stringify(hashes)).not.toContain(c)
    expect(await prisma.auditoria.count({ where: { acao: 'mfa.ativado', entidadeId: String(u.id) } })).toBe(1)

    // S19/S20: token novo nesta sessão; a antiga some; as outras sessões são revogadas
    const novo = tokenDoCookie(conf)
    expect(novo).not.toBe(token)
    const sessao = (cookie: string) => app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers: { cookie } })
    expect((await sessao(`vinimon_sid=${token}`)).statusCode).toBe(401)
    expect((await sessao(`vinimon_sid=${novo}`)).statusCode).toBe(200)
    expect((await sessao(outra.cookie)).statusCode).toBe(401)
  })

  it('confirmar com código errado dá 401 e não ativa nada', async () => {
    const { u, headers } = await adminEmCadastro()
    await post('2fa/iniciar', headers)
    const r = await post('2fa/confirmar', headers, { codigo: '000000' })
    expect(r.statusCode).toBe(401)
    expect(
      (await prisma.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { mfaAtivadoEm: true } })).mfaAtivadoEm,
    ).toBeNull()
  })

  it('confirmar sem ter iniciado dá 400', async () => {
    const { headers } = await adminEmCadastro()
    expect((await post('2fa/confirmar', headers, { codigo: '123456' })).statusCode).toBe(400)
  })

  it('quem já tem 2FA não recadastra (409)', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    await ativarMfa(u.id)
    expect((await post('2fa/iniciar', await headersDe(u.id))).statusCode).toBe(409)
  })

  it('T27: regenerar invalida os códigos antigos e exige a senha', async () => {
    const u = await criarUsuario({ perfil: 'OPERADOR' })
    const antigo = await ativarMfa(u.id)
    const h = await headersDe(u.id)

    const errada = await post('2fa/codigos', h, { senha: 'senha-errada-123' })
    expect(errada.statusCode).toBe(400)
    expect(errada.json().erro.detalhes[0].campo).toBe('senha')

    const ok = await post('2fa/codigos', h, { senha: SENHA_TESTE })
    expect(ok.statusCode).toBe(200)
    const novos: string[] = ok.json().codigos
    expect(novos).toHaveLength(10)
    expect(novos.some((c) => antigo.codigos.includes(c))).toBe(false)
    expect(await prisma.codigoRecuperacao.count({ where: { usuarioId: u.id } })).toBe(10)
    expect(await prisma.auditoria.count({ where: { acao: 'mfa.codigos_regenerados' } })).toBe(1)
  })

  it('equipe não desativa o 2FA (403)', async () => {
    const u = await criarUsuario({ perfil: 'OPERADOR' })
    const { secret } = await ativarMfa(u.id)
    const r = await post('2fa/desativar', await headersDe(u.id), {
      senha: SENHA_TESTE,
      codigo: await generate({ secret }),
    })
    expect(r.statusCode).toBe(403)
    expect(
      (await prisma.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { mfaAtivadoEm: true } })).mfaAtivadoEm,
    ).not.toBeNull()
  })

  it('USUARIO desativa com senha e código; as outras sessões caem e a ação é auditada', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const { secret } = await ativarMfa(u.id)
    const h = await headersDe(u.id)
    const outra = await headersDe(u.id)

    const semSenha = await post('2fa/desativar', h, { senha: 'senha-errada-123', codigo: await generate({ secret }) })
    expect(semSenha.statusCode).toBe(400)

    const ok = await post('2fa/desativar', h, { senha: SENHA_TESTE, codigo: await generate({ secret }) })
    expect(ok.statusCode).toBe(204)
    const dep = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { mfaAtivadoEm: true } })
    expect(dep.mfaAtivadoEm).toBeNull()
    expect(await prisma.codigoRecuperacao.count({ where: { usuarioId: u.id } })).toBe(0)
    expect(await prisma.auditoria.count({ where: { acao: 'mfa.removido', entidadeId: String(u.id) } })).toBe(1)
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers: { cookie: outra.cookie } })).statusCode,
    ).toBe(401)
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers: { cookie: h.cookie } })).statusCode,
    ).toBe(200)
  })
})
