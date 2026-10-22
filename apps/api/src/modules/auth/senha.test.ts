import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco, ORIGEM, SENHA_TESTE, tokenDoCookie } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

const JSON_HDR = { 'content-type': 'application/json' }
const NOVA = 'Pitanga-Lanterna-Rio-2027'

describe('troca de senha (T11, T20)', () => {
  let app: App
  beforeEach(async () => {
    await limparBanco()
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const trocar = (headers: Record<string, string>, payload: object) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/trocar-senha', headers: { ...JSON_HDR, ...headers }, payload })
  const sessao = (cookie: string) => app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers: { cookie } })

  it('T11: sessão em TROCA_SENHA só acessa sessão, troca e logout', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    await prisma.usuario.update({ where: { id: u.id }, data: { deveTrocarSenha: true } })
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...JSON_HDR, origin: ORIGEM },
      payload: { login: u.login, senha: SENHA_TESTE },
    })
    expect(login.json().estado).toBe('TROCA_SENHA')
    const h = { cookie: `vinimon_sid=${tokenDoCookie(login)}`, origin: ORIGEM, 'x-csrf-token': login.json().csrf }

    const bloqueada = await app.inject({ method: 'GET', url: '/api/v1/areas', headers: h })
    expect(bloqueada.statusCode).toBe(403)
    expect(bloqueada.json().erro.codigo).toBe('TROCA_SENHA_OBRIGATORIA')

    const r = await trocar(h, { senhaAtual: SENHA_TESTE, novaSenha: NOVA })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ estado: 'ATIVA', usuario: { id: u.id, deveTrocarSenha: false } })
    expect(await prisma.auditoria.count({ where: { acao: 'senha.alterada', entidadeId: String(u.id) } })).toBe(1)
    const dep = await prisma.usuario.findUniqueOrThrow({
      where: { id: u.id },
      select: { deveTrocarSenha: true, senhaAlteradaEm: true },
    })
    expect(dep).toMatchObject({ deveTrocarSenha: false })
    expect(dep.senhaAlteradaEm).not.toBeNull()
  })

  it('equipe sem 2FA, depois de trocar a senha, segue para CADASTRO_MFA', async () => {
    const u = await criarUsuario({ perfil: 'OPERADOR' })
    await prisma.usuario.update({ where: { id: u.id }, data: { deveTrocarSenha: true } })
    const h = await headersDe(u.id, 'TROCA_SENHA')
    const r = await trocar(h, { senhaAtual: SENHA_TESTE, novaSenha: NOVA })
    expect(r.json()).toMatchObject({ estado: 'CADASTRO_MFA', usuario: null })
  })

  it('T20: a sessão que trocou continua com cookie novo; as outras e o cookie antigo caem', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const a = await headersDe(u.id)
    const b = await headersDe(u.id)
    const r = await trocar(a, { senhaAtual: SENHA_TESTE, novaSenha: NOVA })
    expect(r.statusCode).toBe(200)
    const novo = tokenDoCookie(r)
    expect((await sessao(b.cookie)).statusCode).toBe(401)
    expect((await sessao(a.cookie)).statusCode).toBe(401)
    expect((await sessao(`vinimon_sid=${novo}`)).statusCode).toBe(200)
    expect(await prisma.sessao.count({ where: { usuarioId: u.id, motivoRevogacao: 'troca_senha' } })).toBe(1)
  })

  it('senha atual errada dá 400 no campo senhaAtual e nada muda', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const h = await headersDe(u.id)
    const r = await trocar(h, { senhaAtual: 'senha-errada-123', novaSenha: NOVA })
    expect(r.statusCode).toBe(400)
    expect(r.json().erro).toMatchObject({ codigo: 'VALIDACAO', detalhes: [{ campo: 'senhaAtual' }] })
    expect(await prisma.auditoria.count({ where: { acao: 'senha.alterada' } })).toBe(0)
  })

  it('senha fraca ou igual à atual dá 400 no campo novaSenha', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const h = await headersDe(u.id)
    for (const novaSenha of ['Senha123456!', SENHA_TESTE, 'curta']) {
      const r = await trocar(h, { senhaAtual: SENHA_TESTE, novaSenha })
      expect(r.statusCode, novaSenha).toBe(400)
      expect(r.json().erro.detalhes[0].campo).toBe('novaSenha')
    }
  })

  it('exige sessão e CSRF', async () => {
    expect((await trocar({ origin: ORIGEM }, { senhaAtual: 'x', novaSenha: 'y' })).statusCode).toBe(401)
  })
})
