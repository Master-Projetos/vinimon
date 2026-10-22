import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo problemas', () => {
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

  /** Cria um problema direto no banco, para os cenários de update, 409 e exclusão. */
  async function criarProblemaNoBanco(areaIds: number[], nome = 'Impressora') {
    return prisma.problema.create({
      data: {
        nome,
        areaPadraoId: areaIds[0] ?? null,
        ativo: true,
        areas: { create: areaIds.map((areaId) => ({ areaId })) },
      },
      select: { id: true },
    })
  }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/problemas' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({ method: 'GET', url: '/api/v1/problemas', headers: await headersDe(u.id) })
      expect(res.statusCode).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('ADMIN cria com áreas, audita e a resposta traz areas:[{id,nome}]', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const a1 = await criarArea({ nome: 'Suporte' })
    const a2 = await criarArea({ nome: 'Redes' })
    const headers = await headersDe(admin.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/problemas',
      headers,
      payload: {
        nome: 'Impressora',
        descricao: 'Falhas de impressão',
        areaIds: [a2.id, a1.id],
        areaPadraoId: a1.id,
        slaRespostaMin: 60,
        slaSolucaoMin: null,
        ativo: true,
      },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({
      nome: 'Impressora',
      descricao: 'Falhas de impressão',
      areaPadraoId: a1.id,
      slaRespostaMin: 60,
      slaSolucaoMin: null,
      ativo: true,
      areas: [
        { id: a1.id, nome: 'Suporte' },
        { id: a2.id, nome: 'Redes' },
      ],
    })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'problema' } })).toBe(1)

    const lista = await app.inject({ method: 'GET', url: '/api/v1/problemas', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 1, itens: [{ nome: 'Impressora', areas: [{}, {}] }] })

    const obtida = await app.inject({ method: 'GET', url: `/api/v1/problemas/${res.json().id}`, headers })
    expect(obtida.statusCode).toBe(200)
    expect(obtida.json().areas).toHaveLength(2)
  })

  it('400 com detalhes quando a área padrão não está na lista', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const a1 = await criarArea()
    const outra = await criarArea()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/problemas',
      headers: await headersDe(admin.id),
      payload: {
        nome: 'Impressora',
        areaIds: [a1.id],
        areaPadraoId: outra.id,
        slaRespostaMin: null,
        slaSolucaoMin: null,
        ativo: true,
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().erro.codigo).toBe('VALIDACAO')
    expect(res.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'areaPadraoId' })])
    expect(await prisma.problema.count()).toBe(0)
  })

  it('400 com detalhes para campo inválido e chave desconhecida', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const a1 = await criarArea()
    const headers = await headersDe(admin.id)
    const corpo = {
      nome: 'Impressora',
      areaIds: [a1.id],
      areaPadraoId: a1.id,
      slaRespostaMin: null,
      slaSolucaoMin: null,
      ativo: true,
    }
    const vazia = await app.inject({
      method: 'POST',
      url: '/api/v1/problemas',
      headers,
      payload: { ...corpo, areaIds: [] },
    })
    expect(vazia.statusCode).toBe(400)
    expect(vazia.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'areaIds' })]))

    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/problemas',
      headers,
      payload: { ...corpo, perfil: 'ADMIN' },
    })
    expect(extra.statusCode).toBe(400)
  })

  it('422 quando uma área não atende', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const atende = await criarArea()
    const naoAtende = await criarArea({ nome: 'Arquivo morto', atende: false })
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/problemas',
      headers: await headersDe(admin.id),
      payload: {
        nome: 'Impressora',
        areaIds: [atende.id, naoAtende.id],
        areaPadraoId: atende.id,
        slaRespostaMin: null,
        slaSolucaoMin: null,
        ativo: true,
      },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().erro.codigo).toBe('REGRA_NEGOCIO')
    expect(await prisma.problema.count()).toBe(0)
  })

  it('409 para nome duplicado', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const a1 = await criarArea()
    await criarProblemaNoBanco([a1.id], 'Impressora')
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/problemas',
      headers: await headersDe(admin.id),
      payload: {
        nome: 'Impressora',
        areaIds: [a1.id],
        areaPadraoId: a1.id,
        slaRespostaMin: null,
        slaSolucaoMin: null,
        ativo: true,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().erro.codigo).toBe('CONFLITO')
  })

  it('PATCH troca as áreas (substitui todas) e audita antes/depois', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const a1 = await criarArea()
    const a2 = await criarArea()
    const a3 = await criarArea()
    const problema = await criarProblemaNoBanco([a1.id, a2.id])
    const headers = await headersDe(admin.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/problemas/${problema.id}`,
      headers,
      payload: { areaIds: [a3.id], areaPadraoId: a3.id },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ areaPadraoId: a3.id, areas: [{ id: a3.id }] })
    const vinculos = await prisma.problemaArea.findMany({
      where: { problemaId: problema.id },
      select: { areaId: true },
    })
    expect(vinculos).toEqual([{ areaId: a3.id }])
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.alterado', entidade: 'problema' } })).toBe(1)
  })

  it('PATCH só com área padrão fora das áreas atuais dá 400 com detalhes', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const a1 = await criarArea()
    const outra = await criarArea()
    const problema = await criarProblemaNoBanco([a1.id])
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/problemas/${problema.id}`,
      headers: await headersDe(admin.id),
      payload: { areaPadraoId: outra.id },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'areaPadraoId' })])
  })

  it('PATCH com área que não atende dá 422 e não troca nada', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const a1 = await criarArea()
    const naoAtende = await criarArea({ atende: false })
    const problema = await criarProblemaNoBanco([a1.id])
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/problemas/${problema.id}`,
      headers: await headersDe(admin.id),
      payload: { areaIds: [naoAtende.id], areaPadraoId: naoAtende.id },
    })
    expect(res.statusCode).toBe(422)
    const vinculos = await prisma.problemaArea.findMany({
      where: { problemaId: problema.id },
      select: { areaId: true },
    })
    expect(vinculos).toEqual([{ areaId: a1.id }])
  })

  it('404 para problema inexistente (obter e PATCH)', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const obter = await app.inject({ method: 'GET', url: '/api/v1/problemas/999', headers })
    expect(obter.statusCode).toBe(404)
    expect(obter.json().erro.codigo).toBe('NAO_ENCONTRADO')
    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/problemas/999',
      headers,
      payload: { ativo: false },
    })
    expect(patch.statusCode).toBe(404)
  })

  it('409 REGISTRO_EM_USO ao excluir problema com chamado; sem uso, exclui e audita', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const area = await criarArea()
    const emUso = await criarProblemaNoBanco([area.id], 'Em uso')
    const livre = await criarProblemaNoBanco([area.id], 'Livre')

    const solicitante = await criarUsuario({ perfil: 'USUARIO', areaId: area.id })
    const prioridade = await prisma.prioridade.create({ data: { nome: 'Normal' }, select: { id: true } })
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
        problemaId: emUso.id,
        prioridadeId: prioridade.id,
        canalId: canal.id,
        statusId: status.id,
        statusTipo: status.tipo,
        jornadaId: jornada.id,
      },
    })

    const bloqueado = await app.inject({ method: 'DELETE', url: `/api/v1/problemas/${emUso.id}`, headers })
    expect(bloqueado.statusCode).toBe(409)
    expect(bloqueado.json().erro.codigo).toBe('REGISTRO_EM_USO')
    expect(await prisma.problema.count({ where: { id: emUso.id } })).toBe(1)

    const excluido = await app.inject({ method: 'DELETE', url: `/api/v1/problemas/${livre.id}`, headers })
    expect(excluido.statusCode).toBe(204)
    expect(await prisma.problema.count({ where: { id: livre.id } })).toBe(0)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'problema' } })).toBe(1)
  })
})
