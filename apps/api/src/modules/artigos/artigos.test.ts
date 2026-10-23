import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo artigos', () => {
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

  const novo = { titulo: 'Impressora não imprime', conteudo: '## Passo a passo\nReinicie o spooler.' }

  async function papeis() {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const operador = await criarUsuario({ perfil: 'OPERADOR' })
    const usuario = await criarUsuario({ perfil: 'USUARIO' })
    return {
      admin: await headersDe(admin.id),
      operador: await headersDe(operador.id),
      usuario: await headersDe(usuario.id),
      adminId: admin.id,
    }
  }

  const criar = (headers: Record<string, string>, extra: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: '/api/v1/artigos', headers, payload: { ...novo, ...extra } })

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/artigos' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO ao criar, alterar, excluir; votar e ler continuam permitidos', async () => {
    const h = await papeis()
    const a = (await criar(h.admin, { situacao: 'PUBLICADO' })).json()
    for (const [method, url, payload] of [
      ['POST', '/api/v1/artigos', novo],
      ['PATCH', `/api/v1/artigos/${a.id}`, { titulo: 'Outro título' }],
      ['DELETE', `/api/v1/artigos/${a.id}`, undefined],
    ] as const) {
      const res = await app.inject({ method, url, headers: h.usuario, ...(payload ? { payload } : {}) })
      expect(res.statusCode, `${method} ${url}`).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
    expect((await app.inject({ method: 'GET', url: `/api/v1/artigos/${a.id}`, headers: h.usuario })).statusCode).toBe(
      200,
    )
  })

  it('400 com detalhes por campo e para chave desconhecida', async () => {
    const h = await papeis()
    const curto = await criar(h.admin, { titulo: 'ab' })
    expect(curto.statusCode).toBe(400)
    expect(curto.json().erro.detalhes[0]).toMatchObject({ campo: 'titulo' })
    expect((await criar(h.admin, { naoExiste: 1 })).statusCode).toBe(400)
    const vazio = await app.inject({ method: 'PATCH', url: '/api/v1/artigos/1', headers: h.admin, payload: {} })
    expect(vazio.statusCode).toBe(400)
  })

  it('ADMIN cria rascunho, publica (publicadoEm só na 1ª vez) e audita', async () => {
    const h = await papeis()
    const criado = await criar(h.admin)
    expect(criado.statusCode).toBe(201)
    const a = criado.json()
    expect(a).toMatchObject({
      situacao: 'RASCUNHO',
      visibilidade: 'PUBLICO',
      publicadoEm: null,
      autorId: h.adminId,
      visualizacoes: 0,
      problemaIds: [],
    })

    const pub = await app.inject({
      method: 'PATCH',
      url: `/api/v1/artigos/${a.id}`,
      headers: h.admin,
      payload: { situacao: 'PUBLICADO' },
    })
    expect(pub.statusCode).toBe(200)
    const primeira = pub.json().publicadoEm
    expect(primeira).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/artigos/${a.id}`,
      headers: h.admin,
      payload: { situacao: 'ARQUIVADO' },
    })
    const de_novo = await app.inject({
      method: 'PATCH',
      url: `/api/v1/artigos/${a.id}`,
      headers: h.admin,
      payload: { situacao: 'PUBLICADO' },
    })
    expect(de_novo.json().publicadoEm).toBe(primeira)

    const trilha = await prisma.auditoria.findMany({ where: { entidade: 'artigo' }, orderBy: { id: 'asc' } })
    expect(trilha.map((t) => t.acao)).toEqual([
      'cadastro.criado',
      'cadastro.alterado',
      'cadastro.alterado',
      'cadastro.alterado',
    ])
    expect(JSON.stringify(trilha[0]?.dados)).not.toContain('spooler') // o conteúdo não vai para a auditoria
  })

  it('USUARIO recebe 404 em artigo INTERNO, rascunho e arquivado; a lista só traz PUBLICADO + PUBLICO (S108)', async () => {
    const h = await papeis()
    const visivel = (await criar(h.admin, { titulo: 'Artigo público', situacao: 'PUBLICADO' })).json()
    const interno = (
      await criar(h.admin, { titulo: 'Artigo interno', situacao: 'PUBLICADO', visibilidade: 'INTERNO' })
    ).json()
    const rascunho = (await criar(h.admin, { titulo: 'Artigo rascunho' })).json()
    const arquivado = (await criar(h.admin, { titulo: 'Artigo arquivado', situacao: 'ARQUIVADO' })).json()

    for (const a of [interno, rascunho, arquivado]) {
      const res = await app.inject({ method: 'GET', url: `/api/v1/artigos/${a.id}`, headers: h.usuario })
      expect(res.statusCode, a.titulo).toBe(404)
    }
    const lista = await app.inject({ method: 'GET', url: '/api/v1/artigos', headers: h.usuario })
    expect(lista.json().itens.map((i: { id: number }) => i.id)).toEqual([visivel.id])
    expect(lista.json().total).toBe(1)

    const doOperador = await app.inject({ method: 'GET', url: '/api/v1/artigos', headers: h.operador })
    expect(doOperador.json().total).toBe(4)
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/artigos/${interno.id}`, headers: h.operador })).statusCode,
    ).toBe(200)
  })

  it('GET /:id conta visualizações de forma atômica, mesmo com leituras simultâneas', async () => {
    const h = await papeis()
    const a = (await criar(h.admin, { situacao: 'PUBLICADO' })).json()
    await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({ method: 'GET', url: `/api/v1/artigos/${a.id}`, headers: h.usuario }),
      ),
    )
    const depois = await app.inject({ method: 'GET', url: `/api/v1/artigos/${a.id}`, headers: h.usuario })
    expect(depois.json().visualizacoes).toBe(7)
  })

  it('sugestões encontram "impressora" em "Impressora não imprime", respeitam S108 e limitam a 5', async () => {
    const h = await papeis()
    await criar(h.admin, { situacao: 'PUBLICADO' })
    await criar(h.admin, { titulo: 'Impressora interna da diretoria', situacao: 'PUBLICADO', visibilidade: 'INTERNO' })
    await criar(h.admin, { titulo: 'Impressora em rascunho' })
    const sug = await app.inject({ method: 'GET', url: '/api/v1/artigos/sugestoes?q=impressora', headers: h.usuario })
    expect(sug.statusCode).toBe(200)
    expect(sug.json().map((s: { titulo: string }) => s.titulo)).toEqual(['Impressora não imprime'])

    const doOperador = await app.inject({
      method: 'GET',
      url: '/api/v1/artigos/sugestoes?q=impressora',
      headers: h.operador,
    })
    expect(doOperador.json()).toHaveLength(2) // vê o interno, nunca o rascunho

    for (let i = 0; i < 6; i++) await criar(h.admin, { titulo: `Impressora modelo ${i}`, situacao: 'PUBLICADO' })
    const muitas = await app.inject({ method: 'GET', url: '/api/v1/artigos/sugestoes?q=impressora', headers: h.admin })
    expect(muitas.json()).toHaveLength(5)

    const acento = await app.inject({
      method: 'GET',
      url: '/api/v1/artigos/sugestoes?q=IMPRESSÓRA%20imprime',
      headers: h.usuario,
    })
    expect(acento.statusCode).toBe(200)
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/artigos/sugestoes?q=%27%20or%201%3D1', headers: h.usuario }))
        .statusCode,
    ).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/v1/artigos/sugestoes', headers: h.usuario })).statusCode).toBe(
      400,
    )
  })

  it('problemas N:N: cria, filtra por problemaId, substitui e valida existência', async () => {
    const h = await papeis()
    const p1 = await prisma.problema.create({ data: { nome: 'Impressão' } })
    const p2 = await prisma.problema.create({ data: { nome: 'Rede' } })
    const a = (await criar(h.admin, { situacao: 'PUBLICADO', problemaIds: [p1.id, p1.id, p2.id] })).json()
    expect(a.problemaIds).toEqual([p1.id, p2.id])
    await criar(h.admin, { titulo: 'Outro artigo', situacao: 'PUBLICADO' })

    const filtrada = await app.inject({ method: 'GET', url: `/api/v1/artigos?problemaId=${p1.id}`, headers: h.usuario })
    expect(filtrada.json().itens.map((i: { id: number }) => i.id)).toEqual([a.id])

    const troca = await app.inject({
      method: 'PATCH',
      url: `/api/v1/artigos/${a.id}`,
      headers: h.admin,
      payload: { problemaIds: [p2.id] },
    })
    expect(troca.json().problemaIds).toEqual([p2.id])

    const inexistente = await criar(h.admin, { problemaIds: [999999] })
    expect(inexistente.statusCode).toBe(400)
    expect(inexistente.json().erro.detalhes[0]).toMatchObject({ campo: 'problemaIds' })
    const semCategoria = await criar(h.admin, { categoriaId: 999999 })
    expect(semCategoria.statusCode).toBe(400)
    expect(semCategoria.json().erro.detalhes[0]).toMatchObject({ campo: 'categoriaId' })
  })

  it('busca por título sem acento e filtro por categoria', async () => {
    const h = await papeis()
    const cat = await prisma.categoriaArtigo.create({ data: { nome: 'Hardware', ordem: 1 } })
    await criar(h.admin, { situacao: 'PUBLICADO', categoriaId: cat.id })
    await criar(h.admin, { titulo: 'Senha expirada', situacao: 'PUBLICADO' })
    const porBusca = await app.inject({ method: 'GET', url: '/api/v1/artigos?busca=NAO%20IMPRIME', headers: h.usuario })
    expect(porBusca.json().itens.map((i: { titulo: string }) => i.titulo)).toEqual(['Impressora não imprime'])
    const porCategoria = await app.inject({
      method: 'GET',
      url: `/api/v1/artigos?categoriaId=${cat.id}`,
      headers: h.usuario,
    })
    expect(porCategoria.json().total).toBe(1)
    const percent = await app.inject({ method: 'GET', url: '/api/v1/artigos?busca=%25', headers: h.usuario })
    expect(percent.json().total).toBe(0) // % é literal, não curinga
  })

  it('voto: um por usuário (upsert), conta úteis e não úteis, 404 em artigo invisível, 400 no corpo', async () => {
    const h = await papeis()
    const a = (await criar(h.admin, { situacao: 'PUBLICADO' })).json()
    const interno = (
      await criar(h.admin, { titulo: 'Só equipe', situacao: 'PUBLICADO', visibilidade: 'INTERNO' })
    ).json()
    const votar = (id: number, headers: Record<string, string>, util: unknown) =>
      app.inject({ method: 'POST', url: `/api/v1/artigos/${id}/voto`, headers, payload: { util } })

    expect((await votar(a.id, h.usuario, true)).statusCode).toBe(204)
    expect((await votar(a.id, h.operador, false)).statusCode).toBe(204)
    let lido = (await app.inject({ method: 'GET', url: `/api/v1/artigos/${a.id}`, headers: h.admin })).json()
    expect(lido).toMatchObject({ votosUteis: 1, votosNaoUteis: 1 })

    expect((await votar(a.id, h.usuario, false)).statusCode).toBe(204) // muda o voto, não duplica
    lido = (await app.inject({ method: 'GET', url: `/api/v1/artigos/${a.id}`, headers: h.admin })).json()
    expect(lido).toMatchObject({ votosUteis: 0, votosNaoUteis: 2 })
    expect(await prisma.artigoVoto.count()).toBe(2)

    expect((await votar(interno.id, h.usuario, true)).statusCode).toBe(404)
    expect((await votar(a.id, h.usuario, 'sim')).statusCode).toBe(400)
  })

  it('404 em artigo inexistente e DELETE responde 204; o segundo DELETE dá 404', async () => {
    const h = await papeis()
    expect((await app.inject({ method: 'GET', url: '/api/v1/artigos/999999', headers: h.admin })).statusCode).toBe(404)
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/v1/artigos/999999',
          headers: h.admin,
          payload: { titulo: 'Novo título' },
        })
      ).statusCode,
    ).toBe(404)
    const a = (await criar(h.admin)).json()
    const del = await app.inject({ method: 'DELETE', url: `/api/v1/artigos/${a.id}`, headers: h.admin })
    expect(del.statusCode).toBe(204)
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/artigos/${a.id}`, headers: h.admin })).statusCode).toBe(
      404,
    )
    const trilha = await prisma.auditoria.findMany({ where: { entidade: 'artigo', acao: 'cadastro.excluido' } })
    expect(trilha).toHaveLength(1)
  })
})
