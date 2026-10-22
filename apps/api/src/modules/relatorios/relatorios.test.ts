import { TIPOS_RELATORIO } from '@vinimon/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

const IMPLEMENTADOS = TIPOS_RELATORIO.filter((t) => t !== 'sla' && t !== 'avaliacoes')

describe('módulo relatórios, parte 1 (S58, T34)', () => {
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

  const obter = (tipo: string, headers: Record<string, string>, query = '') =>
    app.inject({ method: 'GET', url: `/api/v1/relatorios/${tipo}${query}`, headers })

  /** A: 2 encerrados (um no prazo, 60 min; um estourado, 180 min), 1 aberto e 1 cancelado (fora dos indicadores). B: 2. */
  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const opA = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const opB = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const enc1 = await criarChamado({ solicitanteId: sol.id, areaId: A.id, papel: 'ENCERRADO', operadorId: opA.id })
    const enc2 = await criarChamado({ solicitanteId: sol.id, areaId: A.id, papel: 'ENCERRADO', operadorId: opA.id })
    await prisma.chamado.update({ where: { id: enc1.id }, data: { slaSolucaoCumprido: true, tempoSolucaoUtilMin: 60 } })
    await prisma.chamado.update({
      where: { id: enc2.id },
      data: { slaSolucaoCumprido: false, tempoSolucaoUtilMin: 180 },
    })
    await criarChamado({ solicitanteId: sol.id, areaId: A.id, papel: 'INICIAL' })
    await criarChamado({ solicitanteId: sol.id, areaId: A.id, papel: 'CANCELADO' })
    await criarChamado({ solicitanteId: sol.id, areaId: B.id, papel: 'INICIAL' })
    await criarChamado({ solicitanteId: sol.id, areaId: B.id, papel: 'EM_ATENDIMENTO', operadorId: opB.id })
    return { A, B, sol, opA, opB, admin }
  }

  it('401 sem sessão; 403 para USUARIO; 400 com tipo desconhecido', async () => {
    const x = await cenario()
    expect((await obter('por-status', {})).statusCode).toBe(401)
    expect((await obter('por-status', await headersDe(x.sol.id))).statusCode).toBe(403)
    expect((await obter('inexistente', await headersDe(x.admin.id))).statusCode).toBe(400)
  })

  it('fixture com resultado conhecido: totais, encerrados, % no prazo e tempo médio (cancelados fora)', async () => {
    const x = await cenario()
    const res = await obter('por-area', await headersDe(x.admin.id))
    expect(res.statusCode).toBe(200)
    const r = res.json()
    expect(r.totais).toEqual({ total: 5, encerrados: 2, pctNoPrazo: 50, tempoMedioSolucaoUtilMin: 120 })
    const linhaA = r.linhas.find((l: { chave: string }) => l.chave === String(x.A.id))
    expect(linhaA).toMatchObject({ total: 3, encerrados: 2, pctNoPrazo: 50, tempoMedioSolucaoUtilMin: 120 })
    const linhaB = r.linhas.find((l: { chave: string }) => l.chave === String(x.B.id))
    expect(linhaB).toMatchObject({ total: 2, encerrados: 0, pctNoPrazo: null, tempoMedioSolucaoUtilMin: null })
    const geral = (await obter('visao-geral', await headersDe(x.admin.id))).json()
    expect(geral.linhas).toHaveLength(1)
    expect(geral.linhas[0]).toMatchObject({ chave: 'geral', total: 5 })
  })

  it('por-operador agrupa "Sem operador" e por-solicitante soma tudo', async () => {
    const x = await cenario()
    const h = await headersDe(x.admin.id)
    const op = (await obter('por-operador', h)).json()
    expect(op.linhas.find((l: { chave: string }) => l.chave === 'sem')).toMatchObject({
      nome: 'Sem operador',
      total: 2,
    })
    expect(op.linhas.find((l: { chave: string }) => l.chave === String(x.opA.id))).toMatchObject({
      total: 2,
      encerrados: 2,
    })
    const por = (await obter('por-solicitante', h)).json()
    expect(por.linhas).toHaveLength(1)
    expect(por.linhas[0].total).toBe(5)
    const st = (await obter('por-status', h)).json()
    expect(st.linhas.reduce((s: number, l: { total: number }) => s + l.total, 0)).toBe(5)
    expect((await obter('por-problema', h)).json().linhas[0]).toMatchObject({ nome: 'Sem tipo de problema' })
  })

  it('T34: OPERADOR da área A soma só A em todos os tipos; areaId=B ou operadorId de B devolve 0', async () => {
    const x = await cenario()
    const h = await headersDe(x.opA.id)
    for (const tipo of IMPLEMENTADOS) {
      const r = (await obter(tipo, h)).json()
      expect(r.totais.total, tipo).toBe(3)
      expect(
        r.linhas.reduce((s: number, l: { total: number }) => s + l.total, 0),
        tipo,
      ).toBe(3)
      const outraArea = (await obter(tipo, h, `?areaId=${x.B.id}`)).json()
      expect(outraArea.totais.total, tipo).toBe(0)
      expect(
        outraArea.linhas.every((l: { total: number }) => l.total === 0),
        tipo,
      ).toBe(true)
      const outroOp = (await obter(tipo, h, `?operadorId=${x.opB.id}`)).json()
      expect(outroOp.totais.total, tipo).toBe(0)
    }
  })

  it('período de 400 dias dá 400; data final antes da inicial dá 400; período curto filtra por abertura', async () => {
    const x = await cenario()
    const h = await headersDe(x.admin.id)
    const longo = await obter('por-status', h, '?de=2025-01-01&ate=2026-02-05')
    expect(longo.statusCode).toBe(400)
    expect(longo.json().erro.detalhes).toBeDefined()
    expect((await obter('por-status', h, '?de=2026-05-10&ate=2026-05-01')).statusCode).toBe(400)
    const passado = await obter('por-status', h, '?de=2020-01-01&ate=2020-01-31')
    expect(passado.statusCode).toBe(200)
    expect(passado.json().totais.total).toBe(0)
  })

  it('sla e avaliacoes ainda não existem nesta parte (404)', async () => {
    const x = await cenario()
    expect((await obter('sla', await headersDe(x.admin.id))).statusCode).toBe(404)
  })
})
