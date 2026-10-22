import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('dispositivos conectados (T22)', () => {
  let app: App
  beforeEach(async () => {
    await limparBanco()
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const listar = (headers: Record<string, string>) =>
    app.inject({ method: 'GET', url: '/api/v1/auth/sessoes', headers })
  const sessao = (headers: Record<string, string>) => app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers })

  it('lista só as sessões ativas do próprio usuário e marca a atual', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const outro = await criarUsuario({ perfil: 'USUARIO' })
    const a = await headersDe(u.id)
    await headersDe(u.id)
    await headersDe(outro.id)
    const r = await listar(a)
    expect(r.statusCode).toBe(200)
    const itens = r.json()
    expect(itens).toHaveLength(2)
    expect(itens.filter((s: { atual: boolean }) => s.atual)).toHaveLength(1)
    expect(JSON.stringify(itens)).not.toMatch(/tokenHash|token_hash/)
  })

  it('encerra outra sessão do próprio usuário e audita', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const a = await headersDe(u.id)
    const b = await headersDe(u.id)
    const alvo = (await listar(a)).json().find((s: { atual: boolean }) => !s.atual)
    const r = await app.inject({ method: 'DELETE', url: `/api/v1/auth/sessoes/${alvo.id}`, headers: a })
    expect(r.statusCode).toBe(204)
    expect((await sessao(b)).statusCode).toBe(401)
    expect((await sessao(a)).statusCode).toBe(200)
    expect(await prisma.auditoria.count({ where: { acao: 'sessao.revogada', entidadeId: alvo.id } })).toBe(1)
  })

  it('a sessão de outro usuário, ou inexistente, dá 404 e nada é revogado', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const outro = await criarUsuario({ perfil: 'USUARIO' })
    const a = await headersDe(u.id)
    const b = await headersDe(outro.id)
    const alheia = (await listar(b)).json()[0].id
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/auth/sessoes/${alheia}`, headers: a })).statusCode).toBe(
      404,
    )
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/v1/auth/sessoes/00000000-0000-7000-8000-000000000000',
          headers: a,
        })
      ).statusCode,
    ).toBe(404)
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/v1/auth/sessoes/nao-e-uuid', headers: a })).statusCode,
    ).toBe(400)
    expect((await sessao(b)).statusCode).toBe(200)
  })

  it('encerrar todas revoga inclusive a atual e limpa o cookie', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const a = await headersDe(u.id)
    const b = await headersDe(u.id)
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/sessoes/encerrar-todas', headers: a })
    expect(r.statusCode).toBe(204)
    expect(String(r.headers['set-cookie'])).toMatch(/vinimon_sid=;/)
    expect((await sessao(a)).statusCode).toBe(401)
    expect((await sessao(b)).statusCode).toBe(401)
    expect(await prisma.sessao.count({ where: { usuarioId: u.id, motivoRevogacao: 'encerrar_todas' } })).toBe(2)
  })
})
