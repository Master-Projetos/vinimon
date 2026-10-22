import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo categorias-artigo', () => {
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

  const corpo = { nome: 'Acesso', ordem: 10, ativo: true }

  async function criarCategoria(dados: { nome: string; ordem: number; ativo?: boolean }) {
    return prisma.categoriaArtigo.create({ data: { ativo: true, ...dados }, select: { id: true } })
  }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/categorias-artigo' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/categorias-artigo',
        headers: await headersDe(u.id),
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('ADMIN cria, audita e recebe 409 em nome duplicado', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const criada = await app.inject({
      method: 'POST',
      url: '/api/v1/categorias-artigo',
      headers,
      payload: { ...corpo, nome: '  Acesso  ' },
    })
    expect(criada.statusCode).toBe(201)
    expect(criada.json()).toEqual({ id: expect.any(Number), nome: 'Acesso', ordem: 10, ativo: true })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'categoria_artigo' } })).toBe(1)

    const duplicada = await app.inject({ method: 'POST', url: '/api/v1/categorias-artigo', headers, payload: corpo })
    expect(duplicada.statusCode).toBe(409)
    expect(duplicada.json().erro.codigo).toBe('CONFLITO')
  })

  it('lista paginada ordenada por ordem, com busca e filtro ativo', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    await criarCategoria({ nome: 'Terceira', ordem: 30 })
    await criarCategoria({ nome: 'Primeira', ordem: 10 })
    await criarCategoria({ nome: 'Segunda', ordem: 20 })
    await criarCategoria({ nome: 'Inativa', ordem: 5, ativo: false })

    const lista = await app.inject({ method: 'GET', url: '/api/v1/categorias-artigo', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 4, pagina: 1, porPagina: 25 })
    expect(lista.json().itens.map((i: { nome: string }) => i.nome)).toEqual([
      'Inativa',
      'Primeira',
      'Segunda',
      'Terceira',
    ])

    const pagina2 = await app.inject({
      method: 'GET',
      url: '/api/v1/categorias-artigo?porPagina=2&pagina=2',
      headers,
    })
    expect(pagina2.json().itens.map((i: { nome: string }) => i.nome)).toEqual(['Segunda', 'Terceira'])

    const ativas = await app.inject({ method: 'GET', url: '/api/v1/categorias-artigo?ativo=true', headers })
    expect(ativas.json()).toMatchObject({ total: 3 })

    const busca = await app.inject({ method: 'GET', url: '/api/v1/categorias-artigo?busca=PRIM', headers })
    expect(busca.json().itens).toEqual([expect.objectContaining({ nome: 'Primeira' })])
  })

  it('400 com detalhes por campo e para chave desconhecida', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const curto = await app.inject({
      method: 'POST',
      url: '/api/v1/categorias-artigo',
      headers,
      payload: { ...corpo, nome: 'x' },
    })
    expect(curto.statusCode).toBe(400)
    expect(curto.json().erro.codigo).toBe('VALIDACAO')
    expect(curto.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nome' })]))

    const ordemFora = await app.inject({
      method: 'POST',
      url: '/api/v1/categorias-artigo',
      headers,
      payload: { ...corpo, ordem: 1001 },
    })
    expect(ordemFora.statusCode).toBe(400)
    expect(ordemFora.json().erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'ordem' })]),
    )

    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/categorias-artigo',
      headers,
      payload: { ...corpo, perfil: 'ADMIN' },
    })
    expect(extra.statusCode).toBe(400)
  })

  it('obtém, altera (com auditoria) e exclui', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const cat = await criarCategoria({ nome: 'Geral', ordem: 1 })

    const obtida = await app.inject({ method: 'GET', url: `/api/v1/categorias-artigo/${cat.id}`, headers })
    expect(obtida.statusCode).toBe(200)
    expect(obtida.json()).toEqual({ id: cat.id, nome: 'Geral', ordem: 1, ativo: true })

    const alterada = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categorias-artigo/${cat.id}`,
      headers,
      payload: { ordem: 2 },
    })
    expect(alterada.statusCode).toBe(200)
    expect(alterada.json()).toMatchObject({ nome: 'Geral', ordem: 2 })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.alterado', entidade: 'categoria_artigo' } })).toBe(1)

    const excluida = await app.inject({ method: 'DELETE', url: `/api/v1/categorias-artigo/${cat.id}`, headers })
    expect(excluida.statusCode).toBe(204)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'categoria_artigo' } })).toBe(1)
  })

  it('404 para categoria inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const obter = await app.inject({ method: 'GET', url: '/api/v1/categorias-artigo/999', headers })
    expect(obter.statusCode).toBe(404)
    expect(obter.json().erro.codigo).toBe('NAO_ENCONTRADO')
    const alterar = await app.inject({
      method: 'PATCH',
      url: '/api/v1/categorias-artigo/999',
      headers,
      payload: { ordem: 3 },
    })
    expect(alterar.statusCode).toBe(404)
    const excluir = await app.inject({ method: 'DELETE', url: '/api/v1/categorias-artigo/999', headers })
    expect(excluir.statusCode).toBe(404)
  })

  it('409 REGISTRO_EM_USO ao excluir categoria com artigo, sem auditar', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const cat = await criarCategoria({ nome: 'Em uso', ordem: 1 })
    await prisma.artigo.create({
      data: { titulo: 'Como redefinir a senha', conteudo: 'Passo a passo.', categoriaId: cat.id },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/categorias-artigo/${cat.id}`,
      headers: await headersDe(admin.id),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().erro.codigo).toBe('REGISTRO_EM_USO')
    expect(await prisma.categoriaArtigo.count({ where: { id: cat.id } })).toBe(1)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'categoria_artigo' } })).toBe(0)
  })

  it('403 ORIGEM_INVALIDA sem Origin e CSRF_INVALIDO sem token', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const { cookie } = await headersDe(admin.id)
    const semOrigem = await app.inject({
      method: 'POST',
      url: '/api/v1/categorias-artigo',
      headers: { cookie },
      payload: corpo,
    })
    expect(semOrigem.statusCode).toBe(403)
    expect(semOrigem.json().erro.codigo).toBe('ORIGEM_INVALIDA')
    const semToken = await app.inject({
      method: 'POST',
      url: '/api/v1/categorias-artigo',
      headers: { cookie, origin: ORIGEM },
      payload: corpo,
    })
    expect(semToken.statusCode).toBe(403)
    expect(semToken.json().erro.codigo).toBe('CSRF_INVALIDO')
  })
})
