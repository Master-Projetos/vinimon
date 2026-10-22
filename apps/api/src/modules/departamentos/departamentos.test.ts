import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo departamentos', () => {
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

  async function criarUnidadeDireta(nome: string) {
    return prisma.unidade.create({ data: { nome, ativo: true }, select: { id: true, nome: true } })
  }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/departamentos' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({ method: 'GET', url: '/api/v1/departamentos', headers: await headersDe(u.id) })
      expect(res.statusCode).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('ADMIN cria, lista paginado, audita e recebe 409 em nome repetido na mesma unidade', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const unidade = await criarUnidadeDireta('Matriz')
    const corpo = { unidadeId: unidade.id, nome: 'Recepção', ativo: true }

    const criada = await app.inject({
      method: 'POST',
      url: '/api/v1/departamentos',
      headers,
      payload: { ...corpo, nome: '  Recepção  ' },
    })
    expect(criada.statusCode).toBe(201)
    expect(criada.json()).toMatchObject({
      unidadeId: unidade.id,
      nome: 'Recepção',
      ativo: true,
      unidade: { id: unidade.id, nome: 'Matriz' },
    })
    expect(criada.json().criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'departamento' } })).toBe(1)

    await app.inject({
      method: 'POST',
      url: '/api/v1/departamentos',
      headers,
      payload: { ...corpo, nome: 'Financeiro' },
    })
    const lista = await app.inject({ method: 'GET', url: '/api/v1/departamentos?porPagina=1&pagina=2', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 2, pagina: 2, porPagina: 1, itens: [{ nome: 'Recepção' }] })

    const duplicada = await app.inject({ method: 'POST', url: '/api/v1/departamentos', headers, payload: corpo })
    expect(duplicada.statusCode).toBe(409)
    expect(duplicada.json().erro.codigo).toBe('CONFLITO')
  })

  it('aceita o mesmo nome em outra unidade', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const matriz = await criarUnidadeDireta('Matriz')
    const filial = await criarUnidadeDireta('Filial Norte')
    const corpo = { nome: 'Almoxarifado', ativo: true }

    const naMatriz = await app.inject({
      method: 'POST',
      url: '/api/v1/departamentos',
      headers,
      payload: { ...corpo, unidadeId: matriz.id },
    })
    expect(naMatriz.statusCode).toBe(201)
    const naFilial = await app.inject({
      method: 'POST',
      url: '/api/v1/departamentos',
      headers,
      payload: { ...corpo, unidadeId: filial.id },
    })
    expect(naFilial.statusCode).toBe(201)
    expect(naFilial.json()).toMatchObject({ unidade: { id: filial.id, nome: 'Filial Norte' } })
  })

  it('400 com detalhes por campo e para chave desconhecida', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const unidade = await criarUnidadeDireta('Matriz')
    const corpo = { unidadeId: unidade.id, nome: 'Recepção', ativo: true }

    const curto = await app.inject({
      method: 'POST',
      url: '/api/v1/departamentos',
      headers,
      payload: { ...corpo, nome: 'x' },
    })
    expect(curto.statusCode).toBe(400)
    expect(curto.json().erro.codigo).toBe('VALIDACAO')
    expect(curto.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nome' })]))

    const semUnidade = await app.inject({
      method: 'POST',
      url: '/api/v1/departamentos',
      headers,
      payload: { nome: 'Recepção', ativo: true },
    })
    expect(semUnidade.statusCode).toBe(400)
    expect(semUnidade.json().erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'unidadeId' })]),
    )

    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/departamentos',
      headers,
      payload: { ...corpo, perfil: 'ADMIN' },
    })
    expect(extra.statusCode).toBe(400)
  })

  it('422 REFERENCIA_INVALIDA com unidade inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/departamentos',
      headers: await headersDe(admin.id),
      payload: { unidadeId: 9999, nome: 'Recepção', ativo: true },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().erro.codigo).toBe('REFERENCIA_INVALIDA')
  })

  it('lista filtra por unidadeId, busca e ativo', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const matriz = await criarUnidadeDireta('Matriz')
    const filial = await criarUnidadeDireta('Filial Norte')
    await prisma.departamento.create({ data: { unidadeId: matriz.id, nome: 'Recepção Centro' } })
    await prisma.departamento.create({ data: { unidadeId: filial.id, nome: 'Recepção Norte' } })
    await prisma.departamento.create({ data: { unidadeId: matriz.id, nome: 'Depósito Antigo', ativo: false } })

    const porUnidade = await app.inject({
      method: 'GET',
      url: `/api/v1/departamentos?unidadeId=${filial.id}`,
      headers,
    })
    expect(porUnidade.statusCode).toBe(200)
    expect(porUnidade.json()).toMatchObject({
      total: 1,
      itens: [{ nome: 'Recepção Norte', unidade: { id: filial.id, nome: 'Filial Norte' } }],
    })

    const porBusca = await app.inject({
      method: 'GET',
      url: `/api/v1/departamentos?busca=recep&unidadeId=${matriz.id}`,
      headers,
    })
    expect(porBusca.json()).toMatchObject({ total: 1, itens: [{ nome: 'Recepção Centro' }] })

    const inativos = await app.inject({ method: 'GET', url: '/api/v1/departamentos?ativo=false', headers })
    expect(inativos.json()).toMatchObject({ total: 1, itens: [{ nome: 'Depósito Antigo', ativo: false }] })
  })

  it('obtém e atualiza departamento, com auditoria antes e depois', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const matriz = await criarUnidadeDireta('Matriz')
    const filial = await criarUnidadeDireta('Filial Norte')
    const departamento = await prisma.departamento.create({ data: { unidadeId: matriz.id, nome: 'Recepção' } })

    const obtido = await app.inject({ method: 'GET', url: `/api/v1/departamentos/${departamento.id}`, headers })
    expect(obtido.statusCode).toBe(200)
    expect(obtido.json()).toMatchObject({ id: departamento.id, nome: 'Recepção', unidade: { nome: 'Matriz' } })

    const alterado = await app.inject({
      method: 'PATCH',
      url: `/api/v1/departamentos/${departamento.id}`,
      headers,
      payload: { unidadeId: filial.id, ativo: false },
    })
    expect(alterado.statusCode).toBe(200)
    expect(alterado.json()).toMatchObject({
      nome: 'Recepção',
      ativo: false,
      unidade: { id: filial.id, nome: 'Filial Norte' },
    })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.alterado', entidade: 'departamento' } })).toBe(1)
  })

  it('PATCH com nome repetido na mesma unidade dá 409 e 422 com unidade inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const matriz = await criarUnidadeDireta('Matriz')
    await prisma.departamento.create({ data: { unidadeId: matriz.id, nome: 'Recepção' } })
    const financeiro = await prisma.departamento.create({ data: { unidadeId: matriz.id, nome: 'Financeiro' } })

    const duplicado = await app.inject({
      method: 'PATCH',
      url: `/api/v1/departamentos/${financeiro.id}`,
      headers,
      payload: { nome: 'Recepção' },
    })
    expect(duplicado.statusCode).toBe(409)
    expect(duplicado.json().erro.codigo).toBe('CONFLITO')

    const semUnidade = await app.inject({
      method: 'PATCH',
      url: `/api/v1/departamentos/${financeiro.id}`,
      headers,
      payload: { unidadeId: 9999 },
    })
    expect(semUnidade.statusCode).toBe(422)
    expect(semUnidade.json().erro.codigo).toBe('REFERENCIA_INVALIDA')
  })

  it('404 para departamento inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/departamentos/999',
      headers: await headersDe(admin.id),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('403 ORIGEM_INVALIDA sem Origin e CSRF_INVALIDO sem token', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const unidade = await criarUnidadeDireta('Matriz')
    const corpo = { unidadeId: unidade.id, nome: 'Recepção', ativo: true }
    const { cookie } = await headersDe(admin.id)
    const semOrigem = await app.inject({
      method: 'POST',
      url: '/api/v1/departamentos',
      headers: { cookie },
      payload: corpo,
    })
    expect(semOrigem.statusCode).toBe(403)
    expect(semOrigem.json().erro.codigo).toBe('ORIGEM_INVALIDA')
    const semToken = await app.inject({
      method: 'POST',
      url: '/api/v1/departamentos',
      headers: { cookie, origin: ORIGEM },
      payload: corpo,
    })
    expect(semToken.statusCode).toBe(403)
    expect(semToken.json().erro.codigo).toBe('CSRF_INVALIDO')
  })

  it('409 REGISTRO_EM_USO ao excluir departamento com usuário', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const unidade = await criarUnidadeDireta('Matriz')
    const departamento = await prisma.departamento.create({ data: { unidadeId: unidade.id, nome: 'Recepção' } })
    const usuario = await criarUsuario({ perfil: 'USUARIO' })
    await prisma.usuario.update({ where: { id: usuario.id }, data: { departamentoId: departamento.id } })

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/departamentos/${departamento.id}`, headers })
    expect(res.statusCode).toBe(409)
    expect(res.json().erro.codigo).toBe('REGISTRO_EM_USO')
    expect(await prisma.departamento.count({ where: { id: departamento.id } })).toBe(1)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'departamento' } })).toBe(0)
  })

  it('exclui departamento sem dependentes e audita', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const unidade = await criarUnidadeDireta('Matriz')
    const departamento = await prisma.departamento.create({ data: { unidadeId: unidade.id, nome: 'Depósito' } })

    const res = await app.inject({ method: 'DELETE', url: `/api/v1/departamentos/${departamento.id}`, headers })
    expect(res.statusCode).toBe(204)
    expect(await prisma.departamento.count({ where: { id: departamento.id } })).toBe(0)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'departamento' } })).toBe(1)
  })
})
