import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'
import { garantirTags } from './service'

describe('módulo tags', () => {
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

  const corpo = { nome: 'Rede', ativo: true }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/tags' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({ method: 'GET', url: '/api/v1/tags', headers: await headersDe(u.id) })
      expect(res.statusCode).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('ADMIN cria, grava nome normalizado, audita e lista paginado', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const criada = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers,
      payload: { ...corpo, nome: '  Rede  ' },
    })
    expect(criada.statusCode).toBe(201)
    expect(criada.json()).toMatchObject({ nome: 'Rede', ativo: true })
    expect(criada.json().criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const gravada = await prisma.tag.findUniqueOrThrow({ where: { id: criada.json().id } })
    expect(gravada.nomeNormalizado).toBe('rede')
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'tag' } })).toBe(1)

    await app.inject({ method: 'POST', url: '/api/v1/tags', headers, payload: { nome: 'Impressora', ativo: true } })
    const lista = await app.inject({ method: 'GET', url: '/api/v1/tags?porPagina=1&pagina=2', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 2, pagina: 2, porPagina: 1, itens: [{ nome: 'Rede' }] })
  })

  it('409 para duplicata sem distinção de maiúsculas', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const primeira = await app.inject({ method: 'POST', url: '/api/v1/tags', headers, payload: corpo })
    expect(primeira.statusCode).toBe(201)

    const caixaAlta = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers,
      payload: { ...corpo, nome: 'REDE' },
    })
    expect(caixaAlta.statusCode).toBe(409)
    expect(caixaAlta.json().erro.codigo).toBe('CONFLITO')
    expect(await prisma.tag.count()).toBe(1)
  })

  it('400 com detalhes por campo e para chave desconhecida', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const vazia = await app.inject({ method: 'POST', url: '/api/v1/tags', headers, payload: { ...corpo, nome: '   ' } })
    expect(vazia.statusCode).toBe(400)
    expect(vazia.json().erro.codigo).toBe('VALIDACAO')
    expect(vazia.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nome' })]))
    const longa = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers,
      payload: { ...corpo, nome: 'a'.repeat(31) },
    })
    expect(longa.statusCode).toBe(400)
    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers,
      payload: { ...corpo, perfil: 'ADMIN' },
    })
    expect(extra.statusCode).toBe(400)
  })

  it('PATCH recalcula o nome normalizado e 404 para tag inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const criada = await app.inject({ method: 'POST', url: '/api/v1/tags', headers, payload: corpo })
    const id = criada.json().id
    const alterada = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tags/${id}`,
      headers,
      payload: { nome: 'Impressão' },
    })
    expect(alterada.statusCode).toBe(200)
    expect(alterada.json()).toMatchObject({ nome: 'Impressão' })
    expect((await prisma.tag.findUniqueOrThrow({ where: { id } })).nomeNormalizado).toBe('impressão')
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.alterado', entidade: 'tag' } })).toBe(1)

    const inexistente = await app.inject({ method: 'GET', url: '/api/v1/tags/999', headers })
    expect(inexistente.statusCode).toBe(404)
    expect(inexistente.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('garantirTags cria as tags que faltam, ignora duplicatas de caixa e reaproveita as existentes', async () => {
    const existente = await prisma.tag.create({ data: { nome: 'Rede', nomeNormalizado: 'rede' } })
    const ids = await prisma.$transaction((tx) => garantirTags(tx, ['REDE', ' Impressora ', 'rede', 'Impressora']))
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(existente.id)
    const impressora = await prisma.tag.findUniqueOrThrow({ where: { nomeNormalizado: 'impressora' } })
    expect(impressora.nome).toBe('Impressora')
    expect(ids[1]).toBe(impressora.id)
    expect(await prisma.tag.count()).toBe(2)

    const novamente = await prisma.$transaction((tx) => garantirTags(tx, ['impressora', 'Rede']))
    expect(novamente).toEqual([impressora.id, existente.id])
  })
})
