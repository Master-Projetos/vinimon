import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarProblema } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo categorias (B07)', () => {
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

  const admin = async () => headersDe((await criarUsuario({ perfil: 'ADMIN' })).id)

  it('401 sem sessão e 403 para OPERADOR', async () => {
    const sem = await app.inject({ method: 'GET', url: '/api/v1/categorias' })
    expect(sem.statusCode).toBe(401)
    const o = await criarUsuario({ perfil: 'OPERADOR' })
    const res = await app.inject({ method: 'GET', url: '/api/v1/categorias', headers: await headersDe(o.id) })
    expect(res.statusCode).toBe(403)
  })

  it('ADMIN cria, lista por grupo, atualiza, audita e recebe 409 em nome duplicado no grupo', async () => {
    const headers = await admin()
    const criada = await app.inject({
      method: 'POST',
      url: '/api/v1/categorias',
      headers,
      payload: { grupo: 1, nome: 'Hardware', ativo: true },
    })
    expect(criada.statusCode).toBe(201)
    const id = criada.json().id as number
    await app.inject({
      method: 'POST',
      url: '/api/v1/categorias',
      headers,
      payload: { grupo: 2, nome: 'Hardware', ativo: true },
    })
    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/categorias',
      headers,
      payload: { grupo: 1, nome: 'Hardware', ativo: true },
    })
    expect(dup.statusCode).toBe(409)
    const lista = await app.inject({ method: 'GET', url: '/api/v1/categorias?grupo=1', headers })
    expect(lista.json().itens).toEqual([{ id, grupo: 1, nome: 'Hardware', ativo: true }])
    const atual = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categorias/${id}`,
      headers,
      payload: { ativo: false },
    })
    expect(atual.json()).toMatchObject({ ativo: false, grupo: 1 })
    expect(await prisma.auditoria.count({ where: { entidade: 'categoria' } })).toBe(3)
  })

  it('400 com detalhes (grupo fora de 1–3, grupo no PATCH) e 404', async () => {
    const headers = await admin()
    const ruim = await app.inject({
      method: 'POST',
      url: '/api/v1/categorias',
      headers,
      payload: { grupo: 4, nome: 'X', ativo: true },
    })
    expect(ruim.statusCode).toBe(400)
    expect(ruim.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'grupo' })]))
    const nova = await app.inject({
      method: 'POST',
      url: '/api/v1/categorias',
      headers,
      payload: { grupo: 1, nome: 'Rede', ativo: true },
    })
    const troca = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categorias/${nova.json().id}`,
      headers,
      payload: { grupo: 2 },
    })
    expect(troca.statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: '/api/v1/categorias/999999', headers })).statusCode).toBe(404)
  })

  it('problema com categoria de grupo errado dá 422; certo grava; em uso não exclui (409)', async () => {
    const headers = await admin()
    const g1 = await prisma.categoria.create({ data: { grupo: 1, nome: 'A' } })
    const g2 = await prisma.categoria.create({ data: { grupo: 2, nome: 'B' } })
    const area = await criarArea()
    const p = await criarProblema({ areaIds: [area.id], areaPadraoId: area.id })
    const url = `/api/v1/problemas/${p.id}`
    const errado = await app.inject({ method: 'PATCH', url, headers, payload: { categoria1Id: g2.id } })
    expect(errado.statusCode).toBe(422)
    const inexistente = await app.inject({ method: 'PATCH', url, headers, payload: { categoria3Id: 999999 } })
    expect(inexistente.statusCode).toBe(422)
    const certo = await app.inject({
      method: 'PATCH',
      url,
      headers,
      payload: { categoria1Id: g1.id, categoria2Id: g2.id },
    })
    expect(certo.statusCode).toBe(200)
    expect(certo.json()).toMatchObject({ categoria1Id: g1.id, categoria2Id: g2.id, categoria3Id: null })
    const emUso = await app.inject({ method: 'DELETE', url: `/api/v1/categorias/${g1.id}`, headers })
    expect(emUso.statusCode).toBe(409)
    expect(emUso.json().erro.codigo).toBe('REGISTRO_EM_USO')
  })

  it('/meta traz as categorias ativas e os rótulos/pré-filtros da abertura', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    await prisma.categoria.create({ data: { grupo: 3, nome: 'Z' } })
    await prisma.categoria.create({ data: { grupo: 1, nome: 'Inativa', ativo: false } })
    const res = await app.inject({ method: 'GET', url: '/api/v1/meta', headers: await headersDe(u.id) })
    expect(res.json().categoriasProblema).toEqual([expect.objectContaining({ grupo: 3, nome: 'Z' })])
    expect(res.json().config['abertura.rotulosCategorias']).toEqual(['Categoria 1', 'Categoria 2', 'Categoria 3'])
    expect(res.json().config['abertura.preFiltros']).toEqual([])
  })
})
