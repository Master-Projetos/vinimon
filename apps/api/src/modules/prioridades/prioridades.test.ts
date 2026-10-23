import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo prioridades', () => {
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
    // limparBanco esvazia tudo: a regra "exatamente uma padrão" começa com a padrão de sempre.
    await prisma.prioridade.create({ data: { nome: 'Média', ordem: 2, padrao: true }, select: { id: true } })
  })

  const corpo = {
    nome: 'Alta',
    cor: '#e67300',
    ordem: 3,
    padrao: false,
    slaRespostaMin: 60,
    slaSolucaoMin: 480,
    ativo: true,
  }

  async function contarPadroes(): Promise<number> {
    return prisma.prioridade.count({ where: { padrao: true } })
  }

  async function criarPrioridadeNoBanco(dados: { nome: string; ordem: number; padrao?: boolean; ativo?: boolean }) {
    return prisma.prioridade.create({ data: { cor: '#2e8b57', ...dados }, select: { id: true } })
  }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/prioridades' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({ method: 'GET', url: '/api/v1/prioridades', headers: await headersDe(u.id) })
      expect(res.statusCode).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('ADMIN cria, lista ordenada por ordem, audita e recebe 409 em nome duplicado', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const criada = await app.inject({
      method: 'POST',
      url: '/api/v1/prioridades',
      headers,
      payload: { ...corpo, nome: '  Crítica  ', ordem: 4 },
    })
    expect(criada.statusCode).toBe(201)
    expect(criada.json()).toEqual({
      id: expect.any(Number),
      nome: 'Crítica',
      cor: '#e67300',
      ordem: 4,
      padrao: false,
      slaRespostaMin: 60,
      slaSolucaoMin: 480,
      ativo: true,
    })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'prioridade' } })).toBe(1)

    const lista = await app.inject({ method: 'GET', url: '/api/v1/prioridades', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({
      total: 2,
      itens: [
        { nome: 'Média', ordem: 2 },
        { nome: 'Crítica', ordem: 4 },
      ],
    })

    const duplicada = await app.inject({
      method: 'POST',
      url: '/api/v1/prioridades',
      headers,
      payload: { ...corpo, nome: 'Crítica' },
    })
    expect(duplicada.statusCode).toBe(409)
    expect(duplicada.json().erro.codigo).toBe('CONFLITO')
  })

  it('400 com detalhes: cor #fff, ordem fora da faixa e chave desconhecida', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const corCurta = await app.inject({
      method: 'POST',
      url: '/api/v1/prioridades',
      headers,
      payload: { ...corpo, cor: '#fff' },
    })
    expect(corCurta.statusCode).toBe(400)
    expect(corCurta.json().erro.codigo).toBe('VALIDACAO')
    expect(corCurta.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'cor' })]))

    const ordemAlta = await app.inject({
      method: 'POST',
      url: '/api/v1/prioridades',
      headers,
      payload: { ...corpo, ordem: 1001 },
    })
    expect(ordemAlta.statusCode).toBe(400)
    expect(ordemAlta.json().erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'ordem' })]),
    )

    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/prioridades',
      headers,
      payload: { ...corpo, perfil: 'ADMIN' },
    })
    expect(extra.statusCode).toBe(400)
  })

  it('sempre existe exatamente uma padrão: criar com padrao=true desmarca a anterior', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    expect(await contarPadroes()).toBe(1)

    const nova = await app.inject({
      method: 'POST',
      url: '/api/v1/prioridades',
      headers,
      payload: { ...corpo, padrao: true },
    })
    expect(nova.statusCode).toBe(201)
    expect(await contarPadroes()).toBe(1)
    expect(await prisma.prioridade.findFirst({ where: { padrao: true }, select: { nome: true } })).toEqual({
      nome: 'Alta',
    })
  })

  it('PATCH com padrao=true em outra prioridade desmarca a anterior; desmarcar a única padrão dá 422', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const alta = await criarPrioridadeNoBanco({ nome: 'Alta', ordem: 3 })
    const padraoAtual = await prisma.prioridade.findFirstOrThrow({ where: { padrao: true }, select: { id: true } })

    const marcar = await app.inject({
      method: 'PATCH',
      url: `/api/v1/prioridades/${alta.id}`,
      headers,
      payload: { padrao: true },
    })
    expect(marcar.statusCode).toBe(200)
    expect(marcar.json()).toMatchObject({ id: alta.id, padrao: true })
    expect(await contarPadroes()).toBe(1)
    expect(
      await prisma.prioridade.findUniqueOrThrow({ where: { id: padraoAtual.id }, select: { padrao: true } }),
    ).toEqual({
      padrao: false,
    })

    const desmarcar = await app.inject({
      method: 'PATCH',
      url: `/api/v1/prioridades/${alta.id}`,
      headers,
      payload: { padrao: false },
    })
    expect(desmarcar.statusCode).toBe(422)
    expect(desmarcar.json().erro.codigo).toBe('REGRA_NEGOCIO')
    expect(desmarcar.json().erro.mensagem).toBe('Defina outra prioridade como padrão.')
    expect(await contarPadroes()).toBe(1)
  })

  it('422 REGRA_NEGOCIO ao inativar a padrão, e ao criar padrão inativa', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const padrao = await prisma.prioridade.findFirstOrThrow({ where: { padrao: true }, select: { id: true } })

    const inativar = await app.inject({
      method: 'PATCH',
      url: `/api/v1/prioridades/${padrao.id}`,
      headers,
      payload: { ativo: false },
    })
    expect(inativar.statusCode).toBe(422)
    expect(inativar.json().erro.codigo).toBe('REGRA_NEGOCIO')
    expect(inativar.json().erro.mensagem).toBe('Defina outra prioridade como padrão.')

    const padraoInativa = await app.inject({
      method: 'POST',
      url: '/api/v1/prioridades',
      headers,
      payload: { ...corpo, padrao: true, ativo: false },
    })
    expect(padraoInativa.statusCode).toBe(422)
    expect(padraoInativa.json().erro.codigo).toBe('REGRA_NEGOCIO')
    expect(await contarPadroes()).toBe(1)
  })

  it('404 para prioridade inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const obter = await app.inject({ method: 'GET', url: '/api/v1/prioridades/999999', headers })
    expect(obter.statusCode).toBe(404)
    expect(obter.json().erro.codigo).toBe('NAO_ENCONTRADO')
    const atualizar = await app.inject({
      method: 'PATCH',
      url: '/api/v1/prioridades/999999',
      headers,
      payload: { nome: 'Outra' },
    })
    expect(atualizar.statusCode).toBe(404)
  })

  it('422 REGRA_NEGOCIO ao excluir a padrão e 409 REGISTRO_EM_USO ao excluir prioridade com chamado', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const padrao = await prisma.prioridade.findFirstOrThrow({ where: { padrao: true }, select: { id: true } })

    const excluirPadrao = await app.inject({ method: 'DELETE', url: `/api/v1/prioridades/${padrao.id}`, headers })
    expect(excluirPadrao.statusCode).toBe(422)
    expect(excluirPadrao.json().erro.codigo).toBe('REGRA_NEGOCIO')
    expect(await prisma.prioridade.count({ where: { id: padrao.id } })).toBe(1)

    const emUso = await criarPrioridadeNoBanco({ nome: 'Crítica', ordem: 4 })
    const area = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO', areaId: area.id })
    const canal = await prisma.canal.create({ data: { nome: 'Sistema Web', sistema: true }, select: { id: true } })
    const status = await prisma.status.create({
      data: { nome: 'Aberto', tipo: 'ABERTO' },
      select: { id: true, tipo: true },
    })
    const jornada = await prisma.jornada.create({ data: { nome: 'Comercial' }, select: { id: true } })
    await prisma.chamado.create({
      data: {
        assunto: 'Impressora parada',
        descricao: 'Não imprime',
        solicitanteId: solicitante.id,
        abertoPorId: solicitante.id,
        areaId: area.id,
        prioridadeId: emUso.id,
        canalId: canal.id,
        statusId: status.id,
        statusTipo: status.tipo,
        jornadaId: jornada.id,
      },
    })

    const bloqueada = await app.inject({ method: 'DELETE', url: `/api/v1/prioridades/${emUso.id}`, headers })
    expect(bloqueada.statusCode).toBe(409)
    expect(bloqueada.json().erro.codigo).toBe('REGISTRO_EM_USO')
    expect(await prisma.prioridade.count({ where: { id: emUso.id } })).toBe(1)
    expect(await contarPadroes()).toBe(1)
  })

  it('exclui prioridade comum e responde 204; audita; 404 ao excluir de novo', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const comum = await criarPrioridadeNoBanco({ nome: 'Baixa', ordem: 1 })

    const excluida = await app.inject({ method: 'DELETE', url: `/api/v1/prioridades/${comum.id}`, headers })
    expect(excluida.statusCode).toBe(204)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'prioridade' } })).toBe(1)

    const novamente = await app.inject({ method: 'DELETE', url: `/api/v1/prioridades/${comum.id}`, headers })
    expect(novamente.statusCode).toBe(404)
  })

  it('403 ORIGEM_INVALIDA sem Origin', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const { cookie } = await headersDe(admin.id)
    const res = await app.inject({ method: 'POST', url: '/api/v1/prioridades', headers: { cookie }, payload: corpo })
    expect(res.statusCode).toBe(403)
    expect(res.json().erro.codigo).toBe('ORIGEM_INVALIDA')
  })
})
