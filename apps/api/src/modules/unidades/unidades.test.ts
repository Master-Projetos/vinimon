import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo unidades', () => {
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

  const corpo = { nome: 'Matriz', endereco: 'Rua das Flores, 100', ativo: true }

  async function criarUnidadeDireta(nome: string) {
    return prisma.unidade.create({ data: { nome, ativo: true } })
  }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/unidades' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({ method: 'GET', url: '/api/v1/unidades', headers: await headersDe(u.id) })
      expect(res.statusCode).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('ADMIN cria, lista paginado, audita e recebe 409 em nome duplicado', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const criada = await app.inject({
      method: 'POST',
      url: '/api/v1/unidades',
      headers,
      payload: { ...corpo, nome: '  Matriz  ' },
    })
    expect(criada.statusCode).toBe(201)
    expect(criada.json()).toMatchObject({ nome: 'Matriz', endereco: 'Rua das Flores, 100', ativo: true })
    expect(criada.json().criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'unidade' } })).toBe(1)

    await app.inject({ method: 'POST', url: '/api/v1/unidades', headers, payload: { ...corpo, nome: 'Filial Norte' } })
    const lista = await app.inject({ method: 'GET', url: '/api/v1/unidades?porPagina=1&pagina=2', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 2, pagina: 2, porPagina: 1, itens: [{ nome: 'Matriz' }] })

    const duplicada = await app.inject({ method: 'POST', url: '/api/v1/unidades', headers, payload: corpo })
    expect(duplicada.statusCode).toBe(409)
    expect(duplicada.json().erro.codigo).toBe('CONFLITO')
  })

  it('lista filtra por busca e ativo', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    await criarUnidadeDireta('Matriz Centro')
    await criarUnidadeDireta('Filial Norte')
    await prisma.unidade.create({ data: { nome: 'Depósito Antigo', ativo: false } })

    const porBusca = await app.inject({ method: 'GET', url: '/api/v1/unidades?busca=matriz', headers })
    expect(porBusca.statusCode).toBe(200)
    expect(porBusca.json()).toMatchObject({ total: 1, itens: [{ nome: 'Matriz Centro' }] })

    const inativas = await app.inject({ method: 'GET', url: '/api/v1/unidades?ativo=false', headers })
    expect(inativas.json()).toMatchObject({ total: 1, itens: [{ nome: 'Depósito Antigo', ativo: false }] })
  })

  it('400 com detalhes por campo e para chave desconhecida', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const curta = await app.inject({
      method: 'POST',
      url: '/api/v1/unidades',
      headers,
      payload: { ...corpo, nome: 'x' },
    })
    expect(curta.statusCode).toBe(400)
    expect(curta.json().erro.codigo).toBe('VALIDACAO')
    expect(curta.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nome' })]))
    const longo = await app.inject({
      method: 'POST',
      url: '/api/v1/unidades',
      headers,
      payload: { ...corpo, endereco: 'x'.repeat(301) },
    })
    expect(longo.statusCode).toBe(400)
    expect(longo.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'endereco' })]))
    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/unidades',
      headers,
      payload: { ...corpo, perfil: 'ADMIN' },
    })
    expect(extra.statusCode).toBe(400)
  })

  it('obtém e atualiza unidade, com auditoria antes e depois', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const unidade = await criarUnidadeDireta('Matriz')

    const obtida = await app.inject({ method: 'GET', url: `/api/v1/unidades/${unidade.id}`, headers })
    expect(obtida.statusCode).toBe(200)
    expect(obtida.json()).toMatchObject({ id: unidade.id, nome: 'Matriz' })

    const alterada = await app.inject({
      method: 'PATCH',
      url: `/api/v1/unidades/${unidade.id}`,
      headers,
      payload: { endereco: null, ativo: false },
    })
    expect(alterada.statusCode).toBe(200)
    expect(alterada.json()).toMatchObject({ nome: 'Matriz', endereco: null, ativo: false })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.alterado', entidade: 'unidade' } })).toBe(1)
  })

  it('404 para unidade inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await app.inject({ method: 'GET', url: '/api/v1/unidades/999', headers: await headersDe(admin.id) })
    expect(res.statusCode).toBe(404)
    expect(res.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('403 ORIGEM_INVALIDA sem Origin e CSRF_INVALIDO sem token', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const { cookie } = await headersDe(admin.id)
    const semOrigem = await app.inject({ method: 'POST', url: '/api/v1/unidades', headers: { cookie }, payload: corpo })
    expect(semOrigem.statusCode).toBe(403)
    expect(semOrigem.json().erro.codigo).toBe('ORIGEM_INVALIDA')
    const semToken = await app.inject({
      method: 'POST',
      url: '/api/v1/unidades',
      headers: { cookie, origin: ORIGEM },
      payload: corpo,
    })
    expect(semToken.statusCode).toBe(403)
    expect(semToken.json().erro.codigo).toBe('CSRF_INVALIDO')
  })

  it('409 REGISTRO_EM_USO ao excluir unidade com departamento', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const unidade = await criarUnidadeDireta('Matriz')
    await prisma.departamento.create({ data: { unidadeId: unidade.id, nome: 'Recepção' } })

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/unidades/${unidade.id}`, headers })
    expect(res.statusCode).toBe(409)
    expect(res.json().erro.codigo).toBe('REGISTRO_EM_USO')
    expect(await prisma.unidade.count({ where: { id: unidade.id } })).toBe(1)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'unidade' } })).toBe(0)
  })

  it('exclui unidade sem departamento e audita', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const unidade = await criarUnidadeDireta('Depósito')

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/unidades/${unidade.id}`, headers })
    expect(res.statusCode).toBe(204)
    expect(await prisma.unidade.count({ where: { id: unidade.id } })).toBe(0)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'unidade' } })).toBe(1)
  })
})
