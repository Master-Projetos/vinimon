import { TIPOS_RELATORIO } from '@vinimon/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo relatórios, parte 2: SLA, avaliações e CSV (S82, S87, T34)', () => {
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
    await semearBase()
  })

  const obter = (tipo: string, headers: Record<string, string>, query = '', sufixo = '') =>
    app.inject({ method: 'GET', url: `/api/v1/relatorios/${tipo}${sufixo}${query}`, headers })

  /**
   * Área A (nome "=SOMA(1)"): c1 resposta e solução cumpridas; c2 ambas estouradas; c3 resposta cumprida e sem meta de
   * solução; c4 sem metas. Área B: c5 cumprida nas duas. Avaliações: c1 OTIMO, c2 RUIM automática (opA); c5 BOM (opB).
   */
  async function cenario() {
    const A = await criarArea({ nome: '=SOMA(1)' })
    const B = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const opA = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const opB = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const novo = (areaId: number, operadorId: number | null, resp: boolean | null, solu: boolean | null) =>
      criarChamado({ solicitanteId: sol.id, areaId, papel: 'ENCERRADO', operadorId }).then((c) =>
        prisma.chamado.update({
          where: { id: c.id },
          data: { slaRespostaCumprido: resp, slaSolucaoCumprido: solu },
        }),
      )
    const c1 = await novo(A.id, opA.id, true, true)
    const c2 = await novo(A.id, opA.id, false, false)
    await novo(A.id, opA.id, true, null)
    await novo(A.id, null, null, null)
    const c5 = await novo(B.id, opB.id, true, true)
    await prisma.avaliacaoChamado.createMany({
      data: [
        { chamadoId: c1.id, avaliadorId: sol.id, nota: 'OTIMO' },
        { chamadoId: c2.id, avaliadorId: null, nota: 'RUIM', automatica: true },
        { chamadoId: c5.id, avaliadorId: sol.id, nota: 'BOM' },
      ],
    })
    return { A, B, sol, opA, opB, admin }
  }

  it('401 sem sessão; 403 para USUARIO; 400 com detalhes para query inválida (JSON e CSV)', async () => {
    const x = await cenario()
    for (const sufixo of ['', '/csv']) {
      expect((await obter('sla', {}, '', sufixo)).statusCode).toBe(401)
      expect((await obter('sla', await headersDe(x.sol.id), '', sufixo)).statusCode).toBe(403)
      const ruim = await obter('sla', await headersDe(x.admin.id), '?de=ontem', sufixo)
      expect(ruim.statusCode).toBe(400)
      expect(ruim.json().erro.detalhes).toBeDefined()
    }
  })

  it('sla: percentuais por área e por problema só sobre quem tem meta; null sem base', async () => {
    const x = await cenario()
    const r = (await obter('sla', await headersDe(x.admin.id))).json()
    expect(r.totais.total).toBe(5)
    const a = r.sla.porArea.find((l: { chave: string }) => l.chave === String(x.A.id))
    expect(a).toMatchObject({
      nome: '=SOMA(1)',
      total: 4,
      comMetaResposta: 3,
      pctRespostaNoPrazo: 66.7,
      comMetaSolucao: 2,
      pctSolucaoNoPrazo: 50,
    })
    const b = r.sla.porArea.find((l: { chave: string }) => l.chave === String(x.B.id))
    expect(b).toMatchObject({ total: 1, pctRespostaNoPrazo: 100, pctSolucaoNoPrazo: 100 })
    expect(r.sla.porProblema).toHaveLength(1)
    expect(r.sla.porProblema[0]).toMatchObject({
      nome: 'Sem tipo de problema',
      total: 5,
      comMetaResposta: 4,
      pctRespostaNoPrazo: 75,
      comMetaSolucao: 3,
      pctSolucaoNoPrazo: 66.7,
    })
    const vazio = (await obter('sla', await headersDe(x.admin.id), '?de=2020-01-01&ate=2020-01-31')).json()
    expect(vazio.sla.porArea).toEqual([])
  })

  it('avaliacoes: distribuição, % automáticas e média por operador', async () => {
    const x = await cenario()
    const r = (await obter('avaliacoes', await headersDe(x.admin.id))).json()
    expect(r.avaliacoes.avaliadas).toBe(3)
    expect(r.avaliacoes.distribuicao).toEqual([
      { nota: 'OTIMO', total: 1 },
      { nota: 'BOM', total: 1 },
      { nota: 'REGULAR', total: 0 },
      { nota: 'RUIM', total: 1 },
    ])
    expect(r.avaliacoes.pctAutomaticas).toBe(33.3)
    expect(r.avaliacoes.mediaGeral).toBe(2.67)
    const m = r.avaliacoes.mediaPorOperador
    expect(m.find((l: { chave: string }) => l.chave === String(x.opA.id))).toMatchObject({ avaliadas: 2, media: 2.5 })
    expect(m.find((l: { chave: string }) => l.chave === String(x.opB.id))).toMatchObject({ avaliadas: 1, media: 3 })
    // O operador da área B só enxerga a própria avaliação.
    const rB = (await obter('avaliacoes', await headersDe(x.opB.id))).json()
    expect(rB.avaliacoes.avaliadas).toBe(1)
    expect(rB.avaliacoes.pctAutomaticas).toBe(0)
    const nenhuma = (await obter('avaliacoes', await headersDe(x.admin.id), '?de=2020-01-01&ate=2020-01-31')).json()
    expect(nenhuma.avaliacoes).toMatchObject({ avaliadas: 0, pctAutomaticas: null, mediaGeral: null })
  })

  it('CSV: BOM, cabeçalhos, content-disposition e neutralização de fórmula (S82)', async () => {
    const x = await cenario()
    const res = await obter('sla', await headersDe(x.admin.id), '', '/csv')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain('relatorio-sla-')
    expect(res.body.startsWith('﻿')).toBe(true)
    expect(res.body).toContain("'=SOMA(1);4;3;66,7;2;50")
    expect(res.body).not.toMatch(/(^|\n)=SOMA/)
    const av = await obter('avaliacoes', await headersDe(x.admin.id), '', '/csv')
    expect(av.body).toContain('OTIMO;1')
    expect(av.body).toContain('% automáticas;33,3')
  })

  it('CSV grava auditoria exportacao.csv só com tipo, filtros e linhas (S87)', async () => {
    const x = await cenario()
    const res = await obter('por-area', await headersDe(x.admin.id), `?areaId=${x.A.id}`, '/csv')
    expect(res.statusCode).toBe(200)
    const reg = await prisma.auditoria.findFirstOrThrow({
      where: { acao: 'exportacao.csv', entidade: 'relatorio' },
      select: { dados: true, atorId: true },
    })
    expect(reg.atorId).toBe(x.admin.id)
    expect(reg.dados).toEqual({ tipo: 'por-area', filtros: { areaId: x.A.id }, linhas: 3 })
  })

  it('T34: OPERADOR da área A soma só A nos 8 tipos (JSON e CSV); areaId=B ou operadorId de B dá 0', async () => {
    const x = await cenario()
    const h = await headersDe(x.opA.id)
    for (const tipo of TIPOS_RELATORIO) {
      const r = (await obter(tipo, h)).json()
      expect(r.totais.total, tipo).toBe(4)
      expect(
        r.linhas.reduce((s: number, l: { total: number }) => s + l.total, 0),
        tipo,
      ).toBe(4)
      for (const query of [`?areaId=${x.B.id}`, `?operadorId=${x.opB.id}`]) {
        const zero = (await obter(tipo, h, query)).json()
        expect(zero.totais.total, `${tipo}${query}`).toBe(0)
        expect(
          zero.linhas.every((l: { total: number }) => l.total === 0),
          tipo,
        ).toBe(true)
      }
      // CSV: mesmo escopo; fora dele nada da área A nem da B aparece.
      const csv = await obter(tipo, h, '', '/csv')
      expect(csv.statusCode, tipo).toBe(200)
      const csvB = await obter(tipo, h, `?areaId=${x.B.id}`, '/csv')
      expect(csvB.statusCode, tipo).toBe(200)
      expect(csvB.body, tipo).not.toContain('SOMA')
    }
    const sla = (await obter('sla', h)).json()
    expect(sla.sla.porArea).toHaveLength(1)
    const av = (await obter('avaliacoes', h)).json()
    expect(av.avaliacoes.avaliadas).toBe(2)
    const csvAv = await obter('avaliacoes', h, '', '/csv')
    expect(csvAv.body).toContain('Avaliadas;2')
  })
})
