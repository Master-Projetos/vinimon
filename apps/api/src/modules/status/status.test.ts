import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type BaseSemeada, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo status', () => {
  let app: App
  let base: BaseSemeada

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
    base = await semearBase()
  })

  const corpo = {
    nome: 'Em triagem',
    tipo: 'ABERTO',
    papel: null,
    cor: '#1565c0',
    pausaSla: false,
    ignorado: false,
    ordem: 300,
    ativo: true,
  } as const

  /** Cria um status sem papel direto no banco, para os cenários de uso, exclusão e atualização. */
  async function criarStatusNoBanco(nome: string, tipo: 'ABERTO' | 'EM_ATENDIMENTO' = 'ABERTO') {
    return prisma.status.create({ data: { nome, tipo }, select: { id: true, tipo: true } })
  }

  /** Chamado mínimo direto no banco, para o status ficar em uso. */
  async function criarChamadoNoBanco(statusId: number, statusTipo: 'ABERTO' | 'EM_ATENDIMENTO') {
    const area = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO', areaId: area.id })
    return prisma.chamado.create({
      data: {
        assunto: 'Impressora parada',
        descricao: 'Não imprime',
        solicitanteId: solicitante.id,
        abertoPorId: solicitante.id,
        areaId: area.id,
        prioridadeId: base.prioridadePadraoId,
        canalId: base.canalWebId,
        statusId,
        statusTipo,
        jornadaId: base.jornada24x7Id,
      },
      select: { id: true },
    })
  }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/status' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({ method: 'GET', url: '/api/v1/status', headers: await headersDe(u.id) })
      expect(res.statusCode).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('ADMIN cria, lista paginado e audita; papel duplicado dá 409', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const criado = await app.inject({ method: 'POST', url: '/api/v1/status', headers, payload: corpo })
    expect(criado.statusCode).toBe(201)
    expect(criado.json()).toMatchObject({
      nome: 'Em triagem',
      tipo: 'ABERTO',
      papel: null,
      pausaSla: false,
      ativo: true,
    })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'status' } })).toBe(1)

    const total = await prisma.status.count()
    const lista = await app.inject({ method: 'GET', url: '/api/v1/status?porPagina=1&pagina=2', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total, pagina: 2, porPagina: 1 })
    expect(lista.json().itens).toHaveLength(1)

    // O seed base já tem o papel INICIAL (tipo ABERTO): um segundo status com o mesmo papel é 409.
    const papelDuplicado = await app.inject({
      method: 'POST',
      url: '/api/v1/status',
      headers,
      payload: { ...corpo, nome: 'Outro inicial', papel: 'INICIAL' },
    })
    expect(papelDuplicado.statusCode).toBe(409)
    expect(papelDuplicado.json().erro.codigo).toBe('CONFLITO')
  })

  it('400 com detalhes: papel INICIAL com tipo PENDENTE, concluído sem pausa de SLA e chave desconhecida', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const papelErrado = await app.inject({
      method: 'POST',
      url: '/api/v1/status',
      headers,
      payload: { ...corpo, tipo: 'PENDENTE', papel: 'INICIAL' },
    })
    expect(papelErrado.statusCode).toBe(400)
    expect(papelErrado.json().erro.codigo).toBe('VALIDACAO')
    expect(papelErrado.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'tipo' })])

    const semPausa = await app.inject({
      method: 'POST',
      url: '/api/v1/status',
      headers,
      payload: { ...corpo, tipo: 'CONCLUIDO', pausaSla: false },
    })
    expect(semPausa.statusCode).toBe(400)
    expect(semPausa.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'pausaSla' })])

    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/status',
      headers,
      payload: { ...corpo, perfil: 'ADMIN' },
    })
    expect(extra.statusCode).toBe(400)
    expect(await prisma.status.count({ where: { nome: 'Em triagem' } })).toBe(0)
  })

  it('PATCH com estado final inválido dá 400 e tipo de status em uso dá 422', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const usado = await criarStatusNoBanco('Usado', 'ABERTO')
    await criarChamadoNoBanco(usado.id, 'ABERTO')

    // Tipo CONCLUIDO sem pausa de SLA gravada: a regra vale no estado final, não só nos campos enviados.
    const estadoFinal = await app.inject({
      method: 'PATCH',
      url: `/api/v1/status/${usado.id}`,
      headers,
      payload: { tipo: 'CONCLUIDO' },
    })
    expect(estadoFinal.statusCode).toBe(400)
    expect(estadoFinal.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'pausaSla' })])

    const emUso = await app.inject({
      method: 'PATCH',
      url: `/api/v1/status/${usado.id}`,
      headers,
      payload: { tipo: 'EM_ATENDIMENTO' },
    })
    expect(emUso.statusCode).toBe(422)
    expect(emUso.json().erro).toMatchObject({
      codigo: 'REGRA_NEGOCIO',
      mensagem: 'Status em uso: o tipo não pode mudar.',
    })
    expect(await prisma.status.findUnique({ where: { id: usado.id }, select: { tipo: true } })).toEqual({
      tipo: 'ABERTO',
    })
  })

  it('PATCH muda o tipo de status sem uso, audita e recusa papel já usado por outro status (409)', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const livre = await criarStatusNoBanco('Livre', 'ABERTO')

    const alterado = await app.inject({
      method: 'PATCH',
      url: `/api/v1/status/${livre.id}`,
      headers,
      payload: { tipo: 'EM_ATENDIMENTO' },
    })
    expect(alterado.statusCode).toBe(200)
    expect(alterado.json()).toMatchObject({ tipo: 'EM_ATENDIMENTO' })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.alterado', entidade: 'status' } })).toBe(1)

    const papelRepetido = await app.inject({
      method: 'PATCH',
      url: `/api/v1/status/${livre.id}`,
      headers,
      payload: { tipo: 'ABERTO', papel: 'INICIAL' },
    })
    expect(papelRepetido.statusCode).toBe(409)
    expect(papelRepetido.json().erro.codigo).toBe('CONFLITO')
  })

  it('422 ao inativar status com papel; ativo=false em status sem papel passa', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const inicial = await prisma.status.findUniqueOrThrow({ where: { papel: 'INICIAL' }, select: { id: true } })
    const comum = await criarStatusNoBanco('Comum', 'ABERTO')

    const comPapel = await app.inject({
      method: 'PATCH',
      url: `/api/v1/status/${inicial.id}`,
      headers,
      payload: { ativo: false },
    })
    expect(comPapel.statusCode).toBe(422)
    expect(comPapel.json().erro.mensagem).toBe('Status com papel não pode ser inativado.')

    const semPapel = await app.inject({
      method: 'PATCH',
      url: `/api/v1/status/${comum.id}`,
      headers,
      payload: { ativo: false },
    })
    expect(semPapel.statusCode).toBe(200)
    expect(semPapel.json()).toMatchObject({ ativo: false })
  })

  it('422 ao excluir status com papel; 409 ao excluir status em uso; sem uso, exclui e audita', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const inicial = await prisma.status.findUniqueOrThrow({ where: { papel: 'INICIAL' }, select: { id: true } })
    const emUso = await criarStatusNoBanco('Em uso', 'ABERTO')
    await criarChamadoNoBanco(emUso.id, 'ABERTO')
    const livre = await criarStatusNoBanco('Livre', 'ABERTO')

    const comPapel = await app.inject({ method: 'DELETE', url: `/api/v1/status/${inicial.id}`, headers })
    expect(comPapel.statusCode).toBe(422)
    expect(await prisma.status.count({ where: { id: inicial.id } })).toBe(1)

    const bloqueado = await app.inject({ method: 'DELETE', url: `/api/v1/status/${emUso.id}`, headers })
    expect(bloqueado.statusCode).toBe(409)
    expect(bloqueado.json().erro.codigo).toBe('REGISTRO_EM_USO')

    const excluido = await app.inject({ method: 'DELETE', url: `/api/v1/status/${livre.id}`, headers })
    expect(excluido.statusCode).toBe(204)
    expect(await prisma.status.count({ where: { id: livre.id } })).toBe(0)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'status' } })).toBe(1)
  })

  it('404 para status inexistente em GET, PATCH e DELETE', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const get = await app.inject({ method: 'GET', url: '/api/v1/status/999999', headers })
    expect(get.statusCode).toBe(404)
    expect(get.json().erro.codigo).toBe('NAO_ENCONTRADO')
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/status/999999',
      headers,
      payload: { ativo: false },
    })
    expect(patch.statusCode).toBe(404)
    const del = await app.inject({ method: 'DELETE', url: '/api/v1/status/999999', headers })
    expect(del.statusCode).toBe(404)
  })
})
