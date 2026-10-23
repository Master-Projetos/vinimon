import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo tipos de ativo', () => {
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

  const corpo = { nome: 'Notebook', ativo: true }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tipos-ativo' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({ method: 'GET', url: '/api/v1/tipos-ativo', headers: await headersDe(u.id) })
      expect(res.statusCode).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('ADMIN cria, lista paginado, audita e recebe 409 em nome duplicado', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/tipos-ativo',
      headers,
      payload: { ...corpo, nome: '  Notebook  ' },
    })
    expect(criado.statusCode).toBe(201)
    expect(criado.json()).toMatchObject({ nome: 'Notebook', ativo: true })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'tipo_ativo' } })).toBe(1)

    await app.inject({ method: 'POST', url: '/api/v1/tipos-ativo', headers, payload: { ...corpo, nome: 'Impressora' } })
    const lista = await app.inject({ method: 'GET', url: '/api/v1/tipos-ativo?porPagina=1&pagina=2', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 2, pagina: 2, porPagina: 1, itens: [{ nome: 'Notebook' }] })

    const duplicado = await app.inject({ method: 'POST', url: '/api/v1/tipos-ativo', headers, payload: corpo })
    expect(duplicado.statusCode).toBe(409)
    expect(duplicado.json().erro.codigo).toBe('CONFLITO')
  })

  it('200 em obter e PATCH; audita a alteração com antes e depois', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const criado = await app.inject({ method: 'POST', url: '/api/v1/tipos-ativo', headers, payload: corpo })
    const id = criado.json().id

    const obtido = await app.inject({ method: 'GET', url: `/api/v1/tipos-ativo/${id}`, headers })
    expect(obtido.statusCode).toBe(200)
    expect(obtido.json()).toMatchObject({ id, nome: 'Notebook', ativo: true })

    const alterado = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tipos-ativo/${id}`,
      headers,
      payload: { ativo: false },
    })
    expect(alterado.statusCode).toBe(200)
    expect(alterado.json()).toMatchObject({ id, nome: 'Notebook', ativo: false })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.alterado', entidade: 'tipo_ativo' } })).toBe(1)
  })

  it('400 com detalhes por campo, PATCH vazio e chave desconhecida', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const curto = await app.inject({
      method: 'POST',
      url: '/api/v1/tipos-ativo',
      headers,
      payload: { ...corpo, nome: 'x' },
    })
    expect(curto.statusCode).toBe(400)
    expect(curto.json().erro.codigo).toBe('VALIDACAO')
    expect(curto.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nome' })]))

    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/tipos-ativo',
      headers,
      payload: { ...corpo, perfil: 'ADMIN' },
    })
    expect(extra.statusCode).toBe(400)

    const criado = await app.inject({ method: 'POST', url: '/api/v1/tipos-ativo', headers, payload: corpo })
    const vazio = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tipos-ativo/${criado.json().id}`,
      headers,
      payload: {},
    })
    expect(vazio.statusCode).toBe(400)
    expect(vazio.json().erro.codigo).toBe('VALIDACAO')
  })

  it('404 para tipo inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const obtido = await app.inject({ method: 'GET', url: '/api/v1/tipos-ativo/999', headers })
    expect(obtido.statusCode).toBe(404)
    expect(obtido.json().erro.codigo).toBe('NAO_ENCONTRADO')

    const alterado = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tipos-ativo/999',
      headers,
      payload: { ativo: false },
    })
    expect(alterado.statusCode).toBe(404)
  })

  it('exclui tipo sem uso e audita', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const criado = await app.inject({ method: 'POST', url: '/api/v1/tipos-ativo', headers, payload: corpo })
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/tipos-ativo/${criado.json().id}`, headers })
    expect(res.statusCode).toBe(204)
    expect(await prisma.tipoAtivo.count()).toBe(0)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'tipo_ativo' } })).toBe(1)
  })

  it('409 REGISTRO_EM_USO ao excluir tipo com ativo, sem auditar', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const tipo = await prisma.tipoAtivo.create({ data: { nome: 'Projetor' }, select: { id: true } })
    await prisma.ativo.create({ data: { etiqueta: 'PROJ-001', tipoId: tipo.id } })

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/tipos-ativo/${tipo.id}`, headers })
    expect(res.statusCode).toBe(409)
    expect(res.json().erro.codigo).toBe('REGISTRO_EM_USO')
    expect(await prisma.tipoAtivo.count({ where: { id: tipo.id } })).toBe(1)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'tipo_ativo' } })).toBe(0)
  })

  it('403 ORIGEM_INVALIDA sem Origin', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const { cookie } = await headersDe(admin.id)
    const res = await app.inject({ method: 'POST', url: '/api/v1/tipos-ativo', headers: { cookie }, payload: corpo })
    expect(res.statusCode).toBe(403)
    expect(res.json().erro.codigo).toBe('ORIGEM_INVALIDA')
  })
})
