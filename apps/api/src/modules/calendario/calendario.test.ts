import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo calendário (C10)', () => {
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

  const DIA = 24 * 60 * 60 * 1000
  const agora = new Date()
  const consulta = (de: Date, ate: Date, extra = '') =>
    `/api/v1/calendario?de=${encodeURIComponent(de.toISOString())}&ate=${encodeURIComponent(ate.toISOString())}${extra}`
  const periodo = () => [new Date(agora.getTime() - 10 * DIA), new Date(agora.getTime() + 10 * DIA)] as const

  it('401 sem sessão e 403 para USUARIO', async () => {
    const [de, ate] = periodo()
    expect((await app.inject({ method: 'GET', url: consulta(de, ate) })).statusCode).toBe(401)
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const res = await app.inject({ method: 'GET', url: consulta(de, ate), headers: await headersDe(u.id) })
    expect(res.statusCode).toBe(403)
  })

  it('400 com detalhes: período de 70 dias, fim antes do início e datas ausentes', async () => {
    const op = await criarUsuario({ perfil: 'OPERADOR' })
    const headers = await headersDe(op.id)
    const longo = await app.inject({
      method: 'GET',
      url: consulta(new Date(agora.getTime() - 70 * DIA), agora),
      headers,
    })
    expect(longo.statusCode).toBe(400)
    expect(longo.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'ate' })])
    const invertido = await app.inject({
      method: 'GET',
      url: consulta(agora, new Date(agora.getTime() - DIA)),
      headers,
    })
    expect(invertido.statusCode).toBe(400)
    const sem = await app.inject({ method: 'GET', url: '/api/v1/calendario', headers })
    expect(sem.statusCode).toBe(400)
    const exato = await app.inject({
      method: 'GET',
      url: consulta(new Date(agora.getTime() - 62 * DIA), agora),
      headers,
    })
    expect(exato.statusCode).toBe(200)
  })

  it('devolve abertura, conclusão e agendamento com o operador e a cor', async () => {
    const A = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    await prisma.usuario.update({ where: { id: op.id }, data: { corCalendario: '#2e8b57' } })
    const aberto = await criarChamado({ solicitanteId: solicitante.id, areaId: A.id, operadorId: op.id })
    const agendado = await criarChamado({
      solicitanteId: solicitante.id,
      areaId: A.id,
      papel: 'AGENDADO',
      operadorId: op.id,
    })
    const concluido = await criarChamado({
      solicitanteId: solicitante.id,
      areaId: A.id,
      papel: 'CONCLUIDO',
      operadorId: op.id,
    })
    const [de, ate] = periodo()
    const res = await app.inject({ method: 'GET', url: consulta(de, ate), headers: await headersDe(op.id) })
    expect(res.statusCode).toBe(200)
    const eventos = res.json() as Array<{
      tipo: string
      chamadoId: number
      data: string
      operador: { id: number; nome: string; cor: string | null } | null
    }>
    const par = (tipo: string, chamadoId: number) => eventos.find((e) => e.tipo === tipo && e.chamadoId === chamadoId)
    expect(par('abertura', aberto.id)?.operador).toMatchObject({ id: op.id, cor: '#2e8b57' })
    expect(par('agendamento', agendado.id)).toBeDefined()
    expect(par('conclusao', concluido.id)).toBeDefined()
    expect(par('conclusao', aberto.id)).toBeUndefined()
    expect(eventos.map((e) => e.data)).toEqual([...eventos.map((e) => e.data)].sort())
    expect(eventos[0]?.data).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('filtra por período, área e operador', async () => {
    const A = await criarArea()
    const B = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const op1 = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const op2 = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const c1 = await criarChamado({ solicitanteId: solicitante.id, areaId: A.id, operadorId: op1.id })
    const c2 = await criarChamado({ solicitanteId: solicitante.id, areaId: B.id, operadorId: op2.id })
    const antigo = await criarChamado({
      solicitanteId: solicitante.id,
      areaId: A.id,
      abertoEm: new Date(agora.getTime() - 40 * DIA),
    })
    const headers = await headersDe(admin.id)
    const [de, ate] = periodo()
    const ids = async (extra: string) =>
      (
        (await app.inject({ method: 'GET', url: consulta(de, ate, extra), headers })).json() as Array<{
          chamadoId: number
        }>
      )
        .map((e) => e.chamadoId)
        .sort((a, b) => a - b)
    expect(await ids('')).toEqual([c1.id, c2.id].sort((a, b) => a - b))
    expect(await ids(`&areaIds=${A.id}`)).toEqual([c1.id])
    expect(await ids(`&operadorIds=${op2.id}`)).toEqual([c2.id])
    expect(await ids(`&areaIds=${A.id}&areaIds=${B.id}`)).toEqual([c1.id, c2.id].sort((a, b) => a - b))
    expect(await ids('')).not.toContain(antigo.id)
  })

  it('fora do escopo não aparece: o operador só vê a própria área e o que é dele', async () => {
    const A = await criarArea()
    const B = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const meu = await criarChamado({ solicitanteId: solicitante.id, areaId: A.id })
    const alheio = await criarChamado({ solicitanteId: solicitante.id, areaId: B.id })
    const [de, ate] = periodo()
    const res = await app.inject({ method: 'GET', url: consulta(de, ate), headers: await headersDe(op.id) })
    const ids = (res.json() as Array<{ chamadoId: number }>).map((e) => e.chamadoId)
    expect(ids).toContain(meu.id)
    expect(ids).not.toContain(alheio.id)
    // pedir a área alheia não amplia o escopo
    const pedido = await app.inject({
      method: 'GET',
      url: consulta(de, ate, `&areaIds=${B.id}`),
      headers: await headersDe(op.id),
    })
    expect(pedido.json()).toEqual([])
  })
})
