import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo áreas', () => {
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

  const corpo = { nome: 'Tecnologia', atende: true, ativo: true, jornadaId: null }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/areas' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({ method: 'GET', url: '/api/v1/areas', headers: await headersDe(u.id) })
      expect(res.statusCode).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('ADMIN cria, lista paginado, audita e recebe 409 em nome duplicado', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const criada = await app.inject({
      method: 'POST',
      url: '/api/v1/areas',
      headers,
      payload: { ...corpo, nome: '  Tecnologia  ' },
    })
    expect(criada.statusCode).toBe(201)
    expect(criada.json()).toMatchObject({ nome: 'Tecnologia', atende: true, ativo: true, jornadaId: null })
    expect(criada.json().criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'area' } })).toBe(1)

    await app.inject({ method: 'POST', url: '/api/v1/areas', headers, payload: { ...corpo, nome: 'Manutenção' } })
    const lista = await app.inject({ method: 'GET', url: '/api/v1/areas?porPagina=1&pagina=2', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 2, pagina: 2, porPagina: 1, itens: [{ nome: 'Tecnologia' }] })

    const duplicada = await app.inject({ method: 'POST', url: '/api/v1/areas', headers, payload: corpo })
    expect(duplicada.statusCode).toBe(409)
    expect(duplicada.json().erro.codigo).toBe('CONFLITO')
    expect(duplicada.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'nome' })])
  })

  it('400 com detalhes por campo e para chave desconhecida', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const curto = await app.inject({ method: 'POST', url: '/api/v1/areas', headers, payload: { ...corpo, nome: 'x' } })
    expect(curto.statusCode).toBe(400)
    expect(curto.json().erro.codigo).toBe('VALIDACAO')
    expect(curto.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nome' })]))
    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/areas',
      headers,
      payload: { ...corpo, perfil: 'ADMIN' },
    })
    expect(extra.statusCode).toBe(400)
  })

  it('422 REFERENCIA_INVALIDA com jornada inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/areas',
      headers: await headersDe(admin.id),
      payload: { ...corpo, jornadaId: 9999 },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().erro.codigo).toBe('REFERENCIA_INVALIDA')
  })

  it('403 ORIGEM_INVALIDA sem Origin e CSRF_INVALIDO sem token', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const { cookie } = await headersDe(admin.id)
    const semOrigem = await app.inject({ method: 'POST', url: '/api/v1/areas', headers: { cookie }, payload: corpo })
    expect(semOrigem.statusCode).toBe(403)
    expect(semOrigem.json().erro.codigo).toBe('ORIGEM_INVALIDA')
    const semToken = await app.inject({
      method: 'POST',
      url: '/api/v1/areas',
      headers: { cookie, origin: ORIGEM },
      payload: corpo,
    })
    expect(semToken.statusCode).toBe(403)
    expect(semToken.json().erro.codigo).toBe('CSRF_INVALIDO')
  })

  it('404 para área inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await app.inject({ method: 'GET', url: '/api/v1/areas/999', headers: await headersDe(admin.id) })
    expect(res.statusCode).toBe(404)
    expect(res.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('409 REGISTRO_EM_USO ao excluir área com usuário', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const area = await criarArea()
    await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/areas/${area.id}`,
      headers: await headersDe(admin.id),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().erro.codigo).toBe('REGISTRO_EM_USO')
  })
})
