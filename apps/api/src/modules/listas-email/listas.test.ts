import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'
import { enfileirarListasDoEvento } from '../modelos-email/service'

describe('módulo listas de distribuição', () => {
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
    await prisma.modeloEmail.createMany({
      data: [
        { evento: 'abertura', assunto: 'Chamado {{numero}}', corpoTexto: 'Olá {{solicitante}}', ativo: true },
        { evento: 'comentario', assunto: 'Comentário {{numero}}', corpoTexto: 'Novo comentário', ativo: true },
        { evento: 'lembrete', assunto: 'Lembrete {{numero}}', corpoTexto: 'Aguarda', ativo: true },
      ],
    })
  })

  const corpo = { nome: 'Redes', emails: ['redes@exemplo.com.br', 'noc@exemplo.com.br'] }

  async function admin() {
    const u = await criarUsuario({ perfil: 'ADMIN' })
    return headersDe(u.id)
  }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/listas-email' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR, em listar, criar e vincular a modelo', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const headers = await headersDe(u.id)
      const lista = await app.inject({ method: 'GET', url: '/api/v1/listas-email', headers })
      expect(lista.statusCode).toBe(403)
      expect(lista.json().erro.codigo).toBe('SEM_PERMISSAO')
      const criada = await app.inject({ method: 'POST', url: '/api/v1/listas-email', headers, payload: corpo })
      expect(criada.statusCode).toBe(403)
      const vinculada = await app.inject({
        method: 'PUT',
        url: '/api/v1/modelos-email/abertura/listas',
        headers,
        payload: { listaIds: [] },
      })
      expect(vinculada.statusCode).toBe(403)
    }
    expect(await prisma.listaEmail.count()).toBe(0)
  })

  it('ADMIN cria, audita e lista paginado', async () => {
    const headers = await admin()
    const criada = await app.inject({ method: 'POST', url: '/api/v1/listas-email', headers, payload: corpo })
    expect(criada.statusCode).toBe(201)
    expect(criada.json()).toMatchObject({ nome: 'Redes', emails: corpo.emails })
    expect(criada.json().criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'lista_email' } })).toBe(1)

    await app.inject({
      method: 'POST',
      url: '/api/v1/listas-email',
      headers,
      payload: { nome: 'Diretoria', emails: ['dir@exemplo.com.br'] },
    })
    const lista = await app.inject({ method: 'GET', url: '/api/v1/listas-email?porPagina=1&pagina=2', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 2, pagina: 2, porPagina: 1, itens: [{ nome: 'Redes' }] })
  })

  it('400 com detalhes para e-mail inválido, lista acima de 100, e-mails repetidos e chave desconhecida', async () => {
    const headers = await admin()
    const invalido = await app.inject({
      method: 'POST',
      url: '/api/v1/listas-email',
      headers,
      payload: { nome: 'Redes', emails: ['nao-e-email'] },
    })
    expect(invalido.statusCode).toBe(400)
    expect(invalido.json().erro.codigo).toBe('VALIDACAO')
    expect(invalido.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'emails.0' })])

    const muitos = Array.from({ length: 101 }, (_, i) => `pessoa${i}@exemplo.com.br`)
    const acima = await app.inject({
      method: 'POST',
      url: '/api/v1/listas-email',
      headers,
      payload: { nome: 'Grande', emails: muitos },
    })
    expect(acima.statusCode).toBe(400)

    const repetidos = await app.inject({
      method: 'POST',
      url: '/api/v1/listas-email',
      headers,
      payload: { nome: 'Repetida', emails: ['a@exemplo.com.br', 'A@exemplo.com.br'] },
    })
    expect(repetidos.statusCode).toBe(400)

    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/listas-email',
      headers,
      payload: { ...corpo, ativo: true },
    })
    expect(extra.statusCode).toBe(400)
    expect(await prisma.listaEmail.count()).toBe(0)
  })

  it('409 para nome duplicado', async () => {
    const headers = await admin()
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/listas-email', headers, payload: corpo })).statusCode,
    ).toBe(201)
    const dup = await app.inject({ method: 'POST', url: '/api/v1/listas-email', headers, payload: corpo })
    expect(dup.statusCode).toBe(409)
    expect(dup.json().erro.codigo).toBe('CONFLITO')
    expect(await prisma.listaEmail.count()).toBe(1)
  })

  it('PATCH altera e audita; 404 para lista inexistente', async () => {
    const headers = await admin()
    const criada = await app.inject({ method: 'POST', url: '/api/v1/listas-email', headers, payload: corpo })
    const id = criada.json().id
    const alterada = await app.inject({
      method: 'PATCH',
      url: `/api/v1/listas-email/${id}`,
      headers,
      payload: { emails: ['so@exemplo.com.br'] },
    })
    expect(alterada.statusCode).toBe(200)
    expect(alterada.json().emails).toEqual(['so@exemplo.com.br'])
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.alterado', entidade: 'lista_email' } })).toBe(1)

    const inexistente = await app.inject({ method: 'GET', url: '/api/v1/listas-email/999', headers })
    expect(inexistente.statusCode).toBe(404)
    expect(inexistente.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('vincular a modelo: 200 grava e audita; id inexistente dá 400 com detalhes; modelo inexistente dá 404', async () => {
    const headers = await admin()
    const lista = await app.inject({ method: 'POST', url: '/api/v1/listas-email', headers, payload: corpo })
    const id = lista.json().id

    const ok = await app.inject({
      method: 'PUT',
      url: '/api/v1/modelos-email/abertura/listas',
      headers,
      payload: { listaIds: [id] },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ evento: 'abertura', listaIds: [id] })
    expect((await prisma.modeloEmail.findUniqueOrThrow({ where: { evento: 'abertura' } })).listaIds).toEqual([id])
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.alterado', entidade: 'modelo_email' } })).toBe(1)

    const faltando = await app.inject({
      method: 'PUT',
      url: '/api/v1/modelos-email/abertura/listas',
      headers,
      payload: { listaIds: [id, 999] },
    })
    expect(faltando.statusCode).toBe(400)
    expect(faltando.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'listaIds' })])

    const semModelo = await app.inject({
      method: 'PUT',
      url: '/api/v1/modelos-email/recuperar_senha/listas',
      headers,
      payload: { listaIds: [] },
    })
    expect(semModelo.statusCode).toBe(404)
    expect(semModelo.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('excluir lista tira o id dos modelos que a referenciavam, na mesma transação', async () => {
    const headers = await admin()
    const lista = await app.inject({ method: 'POST', url: '/api/v1/listas-email', headers, payload: corpo })
    const id = lista.json().id
    const outra = await app.inject({
      method: 'POST',
      url: '/api/v1/listas-email',
      headers,
      payload: { nome: 'Diretoria', emails: ['dir@exemplo.com.br'] },
    })
    const outraId = outra.json().id
    await app.inject({
      method: 'PUT',
      url: '/api/v1/modelos-email/abertura/listas',
      headers,
      payload: { listaIds: [id, outraId] },
    })

    const excluida = await app.inject({ method: 'DELETE', url: `/api/v1/listas-email/${id}`, headers })
    expect(excluida.statusCode).toBe(204)
    expect((await prisma.modeloEmail.findUniqueOrThrow({ where: { evento: 'abertura' } })).listaIds).toEqual([outraId])
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'lista_email' } })).toBe(1)

    const denovo = await app.inject({ method: 'DELETE', url: `/api/v1/listas-email/${id}`, headers })
    expect(denovo.statusCode).toBe(404)
  })

  it('efeito no modelo: abertura vai para as listas; comentario (conteúdo interno possível), lembrete e modelo inativo não', async () => {
    const headers = await admin()
    const lista = await app.inject({ method: 'POST', url: '/api/v1/listas-email', headers, payload: corpo })
    const id = lista.json().id
    for (const evento of ['abertura', 'comentario', 'lembrete']) {
      await app.inject({
        method: 'PUT',
        url: `/api/v1/modelos-email/${evento}/listas`,
        headers,
        payload: { listaIds: [id] },
      })
    }
    const base = { assunto: 'Chamado #1', texto: 'Texto', chaveIdempotencia: 'abertura:1' }

    const ids = await prisma.$transaction((tx) => enfileirarListasDoEvento(tx, 'abertura', base))
    expect(ids).toHaveLength(2)
    const saidas = await prisma.emailSaida.findMany({ where: { evento: 'abertura' }, orderBy: { para: 'asc' } })
    expect(saidas.map((s) => s.para)).toEqual(['noc@exemplo.com.br', 'redes@exemplo.com.br'])

    const comentario = await prisma.$transaction((tx) =>
      enfileirarListasDoEvento(tx, 'comentario', { ...base, chaveIdempotencia: 'comentario:1' }),
    )
    const lembrete = await prisma.$transaction((tx) =>
      enfileirarListasDoEvento(tx, 'lembrete', { ...base, chaveIdempotencia: 'lembrete:1' }),
    )
    expect(comentario).toEqual([])
    expect(lembrete).toEqual([])

    await prisma.modeloEmail.update({ where: { evento: 'abertura' }, data: { ativo: false } })
    const inativo = await prisma.$transaction((tx) =>
      enfileirarListasDoEvento(tx, 'abertura', { ...base, chaveIdempotencia: 'abertura:2' }),
    )
    expect(inativo).toEqual([])
  })
})
