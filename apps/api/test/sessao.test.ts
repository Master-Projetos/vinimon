import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type App, buildApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { criarUsuario, headersDe, limparBanco } from './ajudantes'

describe('ciclo de vida da sessão', () => {
  let app: App
  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(limparBanco)

  const sessao = (headers: Record<string, string>) => app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers })

  it('T19: sessão com expiraEm no passado dá 401', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const h = await headersDe(u.id)
    expect((await sessao(h)).statusCode).toBe(200)
    await prisma.sessao.updateMany({
      where: { usuarioId: u.id },
      data: { criadaEm: new Date(Date.now() - 3_600_000), expiraEm: new Date(Date.now() - 1000) },
    })
    expect((await sessao(h)).statusCode).toBe(401)
  })

  it('T19: 61 min de inatividade dá 401 e revoga por inatividade', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const h = await headersDe(u.id)
    await prisma.sessao.updateMany({
      where: { usuarioId: u.id },
      data: { ultimoUsoEm: new Date(Date.now() - 61 * 60_000) },
    })
    expect((await sessao(h)).statusCode).toBe(401)
    expect(await prisma.sessao.count({ where: { usuarioId: u.id, motivoRevogacao: 'inatividade' } })).toBe(1)
  })

  it('T19: ultimoUsoEm só é gravado a cada 60 s', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const h = await headersDe(u.id)
    const recente = new Date(Date.now() - 30_000)
    await prisma.sessao.updateMany({ where: { usuarioId: u.id }, data: { ultimoUsoEm: recente } })
    expect((await sessao(h)).statusCode).toBe(200)
    expect((await prisma.sessao.findFirstOrThrow({ where: { usuarioId: u.id } })).ultimoUsoEm.getTime()).toBe(
      recente.getTime(),
    )

    await prisma.sessao.updateMany({ where: { usuarioId: u.id }, data: { ultimoUsoEm: new Date(Date.now() - 90_000) } })
    expect((await sessao(h)).statusCode).toBe(200)
    expect(
      Date.now() - (await prisma.sessao.findFirstOrThrow({ where: { usuarioId: u.id } })).ultimoUsoEm.getTime(),
    ).toBeLessThan(5_000)
  })

  it('S18: usuário desativado perde o acesso na hora', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const h = await headersDe(u.id)
    await prisma.usuario.update({ where: { id: u.id }, data: { ativo: false } })
    expect((await sessao(h)).statusCode).toBe(401)
  })

  it('T22: a 11ª sessão revoga a mais antiga', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const primeira = await headersDe(u.id)
    for (let i = 0; i < 10; i++) await headersDe(u.id)
    expect(await prisma.sessao.count({ where: { usuarioId: u.id, revogadaEm: null } })).toBe(10)
    expect(await prisma.sessao.count({ where: { usuarioId: u.id, motivoRevogacao: 'limite' } })).toBe(1)
    expect((await sessao(primeira)).statusCode).toBe(401)
  })

  it('T22: o logout revoga só a própria sessão', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const a = await headersDe(u.id)
    const b = await headersDe(u.id)
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: a })).statusCode).toBe(204)
    expect((await sessao(a)).statusCode).toBe(401)
    expect((await sessao(b)).statusCode).toBe(200)
  })
})
