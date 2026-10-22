import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo canais', () => {
  let app: App

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
  })

  const corpo = { nome: 'Telefone', ativo: true }

  /** Canal de sistema criado direto no banco (o seed não roda nos testes). */
  async function criarCanalSistema(nome = 'Sistema Web') {
    return prisma.canal.create({ data: { nome, sistema: true }, select: { id: true } })
  }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/canais' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({ method: 'GET', url: '/api/v1/canais', headers: await headersDe(u.id) })
      expect(res.statusCode).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('ADMIN cria, lista paginado, audita e recebe 409 em nome duplicado', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/canais',
      headers,
      payload: { ...corpo, nome: '  Telefone  ' },
    })
    expect(criado.statusCode).toBe(201)
    expect(criado.json()).toEqual({ id: expect.any(Number), nome: 'Telefone', sistema: false, ativo: true })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'canal' } })).toBe(1)

    await app.inject({ method: 'POST', url: '/api/v1/canais', headers, payload: { ...corpo, nome: 'E-mail' } })
    const lista = await app.inject({ method: 'GET', url: '/api/v1/canais?porPagina=1&pagina=2', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 2, pagina: 2, porPagina: 1, itens: [{ nome: 'Telefone' }] })

    const duplicado = await app.inject({ method: 'POST', url: '/api/v1/canais', headers, payload: corpo })
    expect(duplicado.statusCode).toBe(409)
    expect(duplicado.json().erro.codigo).toBe('CONFLITO')
  })

  it('400 com detalhes por campo e para chave desconhecida', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const curto = await app.inject({ method: 'POST', url: '/api/v1/canais', headers, payload: { ...corpo, nome: 'x' } })
    expect(curto.statusCode).toBe(400)
    expect(curto.json().erro.codigo).toBe('VALIDACAO')
    expect(curto.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nome' })]))
    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/canais',
      headers,
      payload: { ...corpo, sistema: true },
    })
    expect(extra.statusCode).toBe(400)
    expect(extra.json().erro.codigo).toBe('VALIDACAO')
  })

  it('PATCH altera nome e ativo de canal comum e audita', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const canal = await prisma.canal.create({ data: { nome: 'Telefone' }, select: { id: true } })
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/canais/${canal.id}`,
      headers,
      payload: { nome: 'Telefonia', ativo: false },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: canal.id, nome: 'Telefonia', sistema: false, ativo: false })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.alterado', entidade: 'canal' } })).toBe(1)
  })

  it('404 para canal inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await app.inject({ method: 'GET', url: '/api/v1/canais/999', headers: await headersDe(admin.id) })
    expect(res.statusCode).toBe(404)
    expect(res.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('422 REGRA_NEGOCIO: canal de sistema não é renomeado, inativado nem excluído', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const sistema = await criarCanalSistema()

    const renomear = await app.inject({
      method: 'PATCH',
      url: `/api/v1/canais/${sistema.id}`,
      headers,
      payload: { nome: 'Outro nome' },
    })
    expect(renomear.statusCode).toBe(422)
    expect(renomear.json().erro.codigo).toBe('REGRA_NEGOCIO')

    const inativar = await app.inject({
      method: 'PATCH',
      url: `/api/v1/canais/${sistema.id}`,
      headers,
      payload: { ativo: false },
    })
    expect(inativar.statusCode).toBe(422)
    expect(inativar.json().erro.codigo).toBe('REGRA_NEGOCIO')

    const excluir = await app.inject({ method: 'DELETE', url: `/api/v1/canais/${sistema.id}`, headers })
    expect(excluir.statusCode).toBe(422)
    expect(excluir.json().erro.codigo).toBe('REGRA_NEGOCIO')

    const intacto = await prisma.canal.findUniqueOrThrow({
      where: { id: sistema.id },
      select: { nome: true, ativo: true },
    })
    expect(intacto).toEqual({ nome: 'Sistema Web', ativo: true })
  })

  it('exclui canal comum e responde 204; 404 ao excluir de novo', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const canal = await prisma.canal.create({ data: { nome: 'Chat' }, select: { id: true } })
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/canais/${canal.id}`, headers })
    expect(res.statusCode).toBe(204)
    const novamente = await app.inject({ method: 'DELETE', url: `/api/v1/canais/${canal.id}`, headers })
    expect(novamente.statusCode).toBe(404)
  })
})
