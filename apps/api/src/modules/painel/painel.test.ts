import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo painel (S44, S45, T34)', () => {
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

  const obter = (headers: Record<string, string>, query = '') =>
    app.inject({ method: 'GET', url: `/api/v1/painel${query}`, headers })

  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const outro = await criarUsuario({ perfil: 'USUARIO' })
    const opA = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const opB = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const em = (areaId: number, papel: Parameters<typeof criarChamado>[0]['papel'], extra = {}) =>
      criarChamado({ solicitanteId: solicitante.id, areaId, ...(papel ? { papel } : {}), ...extra })
    // A: 2 na fila sem responsável, 1 em atendimento do opA, 1 concluído (aguardando validação). B: 3 na fila.
    await em(A.id, 'INICIAL')
    await em(A.id, 'INICIAL')
    await em(A.id, 'EM_ATENDIMENTO', { operadorId: opA.id })
    await em(A.id, 'CONCLUIDO', { operadorId: opA.id })
    await em(B.id, 'INICIAL')
    await em(B.id, 'INICIAL')
    await em(B.id, 'INICIAL')
    await criarChamado({ solicitanteId: outro.id, areaId: A.id, papel: 'INICIAL' })
    return { A, B, solicitante, outro, opA, opB, admin }
  }

  it('401 sem sessão', async () => {
    expect((await obter({})).statusCode).toBe(401)
  })

  it('OPERADOR da área A conta só o escopo: nada de B entra nos KPIs nem nas distribuições', async () => {
    const x = await cenario()
    const res = await obter(await headersDe(x.opA.id))
    expect(res.statusCode).toBe(200)
    const p = res.json()
    expect(p.reduzido).toBe(false)
    expect(p.kpis).toMatchObject({
      abertos: 4, // 3 INICIAL (2 + 1 do outro solicitante) + 1 em atendimento
      filaSemResponsavel: 3,
      minhaFila: 1,
      abertosHoje: 5,
      aguardandoValidacao: 1,
    })
    expect(p.porArea).toEqual([{ id: x.A.id, nome: expect.any(String), total: 4 }])
    const mesAtual = p.abertosEncerradosPorMes.at(-1)
    expect(p.abertosEncerradosPorMes).toHaveLength(4)
    expect(mesAtual.abertos).toBe(5)
  })

  it('ADMIN vê tudo; areaId filtra por destino e por origem sem ampliar o escopo', async () => {
    const x = await cenario()
    const hAdmin = await headersDe(x.admin.id)
    expect((await obter(hAdmin)).json().kpis.abertos).toBe(7)
    expect((await obter(hAdmin, `?areaId=${x.B.id}`)).json().kpis.abertos).toBe(3)
    // origem: filtra pela área do solicitante (nenhum dos solicitantes tem área)
    expect((await obter(hAdmin, `?areaId=${x.B.id}&modoArea=origem`)).json().kpis.abertos).toBe(0)
    // OPERADOR de A pedindo a área B continua só com o escopo dele: totais 0
    const op = await obter(await headersDe(x.opA.id), `?areaId=${x.B.id}`)
    expect(op.json().kpis).toMatchObject({ abertos: 0, filaSemResponsavel: 0, abertosHoje: 0 })
    expect(op.json().porArea).toEqual([])
  })

  it('USUARIO recebe a versão reduzida, só com os próprios chamados', async () => {
    const x = await cenario()
    const p = (await obter(await headersDe(x.outro.id))).json()
    expect(p.reduzido).toBe(true)
    expect(p.kpis).toMatchObject({ abertos: 1, filaSemResponsavel: 0, minhaFila: 0 })
    expect(p.porArea).toEqual([])
    const doSolicitante = (await obter(await headersDe(x.solicitante.id))).json()
    expect(doSolicitante.kpis.abertos).toBe(6)
  })

  it('SLA vencido, em risco e mais próximo respeitam o escopo', async () => {
    const x = await cenario()
    const agora = Date.now()
    const c = await criarChamado({
      solicitanteId: x.solicitante.id,
      areaId: x.A.id,
      papel: 'EM_ATENDIMENTO',
      operadorId: x.opA.id,
    })
    const d = await criarChamado({ solicitanteId: x.solicitante.id, areaId: x.B.id, papel: 'EM_ATENDIMENTO' })
    await prisma.chamado.update({
      where: { id: c.id },
      data: { prazoSolucaoEm: new Date(agora - 3600_000), alertaSolucaoEm: new Date(agora - 7200_000) },
    })
    await prisma.chamado.update({
      where: { id: d.id },
      data: { prazoSolucaoEm: new Date(agora - 3600_000), alertaSolucaoEm: new Date(agora - 7200_000) },
    })
    const p = (await obter(await headersDe(x.opA.id))).json()
    expect(p.kpis.slaVencido).toBe(1)
    expect(p.slaProximo.map((s: { id: number }) => s.id)).toEqual([c.id])
  })

  it('nenhuma query do painel lê `chamados` sem LIMIT, COUNT ou GROUP BY', async () => {
    const x = await cenario()
    const consultas: string[] = []
    let captura = false
    prisma.$on('query', (e) => {
      if (captura) consultas.push(e.query)
    })
    const headers = await headersDe(x.opA.id)
    captura = true
    const res = await obter(headers)
    captura = false
    expect(res.statusCode).toBe(200)
    const leituras = consultas.filter((q) => /^\s*SELECT/i.test(q) && /FROM "public"\."chamados"/.test(q))
    expect(leituras.length).toBeGreaterThan(0)
    for (const q of leituras) expect(q, q).toMatch(/LIMIT|COUNT\(|GROUP BY/i)
  })

  it('400 com período inválido', async () => {
    const x = await cenario()
    const res = await obter(await headersDe(x.opA.id), '?periodo=15')
    expect(res.statusCode).toBe(400)
    expect(res.json().erro.detalhes).toBeDefined()
  })
})
