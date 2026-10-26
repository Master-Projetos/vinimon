import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarProblema, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('áreas destino por área solicitante (A05)', () => {
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

  const corpo = { nome: 'Compras', atende: false, ativo: true, jornadaId: null }

  async function cenario() {
    const origem = await criarArea({ atende: false })
    const ti = await criarArea({ nome: 'TI' })
    const manutencao = await criarArea({ nome: 'Manutenção' })
    const rh = await criarArea({ nome: 'RH' })
    const solicitante = await criarUsuario({ perfil: 'USUARIO', areaId: origem.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    return { origem, ti, manutencao, rh, solicitante, admin, hAdmin: await headersDe(admin.id) }
  }

  const abrir = (headers: Record<string, string>, problemaId: number, extra: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/chamados',
      headers,
      payload: { assunto: 'Chamado de teste', descricao: 'Descrição do chamado.', problemaId, ...extra },
    })

  it('cadastro: grava, devolve, substitui e preserva os destinos quando o campo não vem', async () => {
    const x = await cenario()
    const criada = await app.inject({
      method: 'POST',
      url: '/api/v1/areas',
      headers: x.hAdmin,
      payload: {
        ...corpo,
        destinos: [
          { areaId: x.manutencao.id, padrao: false },
          { areaId: x.ti.id, padrao: true },
        ],
      },
    })
    expect(criada.statusCode).toBe(201)
    expect(criada.json().destinos).toEqual(
      [
        { areaId: x.ti.id, padrao: true },
        { areaId: x.manutencao.id, padrao: false },
      ].sort((a, b) => a.areaId - b.areaId),
    )
    const id = criada.json().id as number

    const semCampo = await app.inject({
      method: 'PATCH',
      url: `/api/v1/areas/${id}`,
      headers: x.hAdmin,
      payload: { nome: 'Compras e Suprimentos' },
    })
    expect(semCampo.statusCode).toBe(200)
    expect(semCampo.json().destinos).toHaveLength(2)

    const troca = await app.inject({
      method: 'PATCH',
      url: `/api/v1/areas/${id}`,
      headers: x.hAdmin,
      payload: { destinos: [{ areaId: x.rh.id, padrao: false }] },
    })
    expect(troca.json().destinos).toEqual([{ areaId: x.rh.id, padrao: false }])
    const lista = await app.inject({ method: 'GET', url: '/api/v1/areas', headers: x.hAdmin })
    expect(lista.json().itens.find((a: { id: number }) => a.id === id).destinos).toHaveLength(1)

    const limpa = await app.inject({
      method: 'PATCH',
      url: `/api/v1/areas/${id}`,
      headers: x.hAdmin,
      payload: { destinos: [] },
    })
    expect(limpa.json().destinos).toEqual([])
    expect(await prisma.areaDestino.count({ where: { areaOrigemId: id } })).toBe(0)
  })

  it('400 para destino repetido ou mais de um padrão; 422 para área inexistente, inativa ou que não atende', async () => {
    const x = await cenario()
    const post = (destinos: unknown) =>
      app.inject({ method: 'POST', url: '/api/v1/areas', headers: x.hAdmin, payload: { ...corpo, destinos } })
    const repetido = await post([
      { areaId: x.ti.id, padrao: false },
      { areaId: x.ti.id, padrao: false },
    ])
    expect(repetido.statusCode).toBe(400)
    expect(repetido.json().erro.detalhes.length).toBeGreaterThan(0)
    const doisPadroes = await post([
      { areaId: x.ti.id, padrao: true },
      { areaId: x.rh.id, padrao: true },
    ])
    expect(doisPadroes.statusCode).toBe(400)
    expect((await post([{ areaId: 999_999, padrao: false }])).statusCode).toBe(422)
    expect((await post([{ areaId: x.origem.id, padrao: false }])).statusCode).toBe(422) // não atende
    await prisma.area.update({ where: { id: x.rh.id }, data: { ativo: false } })
    expect((await post([{ areaId: x.rh.id, padrao: false }])).statusCode).toBe(422)
    expect((await post([{ areaId: x.ti.id, padrao: 'sim' }])).statusCode).toBe(400)
  })

  it('área sem destinos configurados permite todas', async () => {
    const x = await cenario()
    const problema = await criarProblema({ areaIds: [x.ti.id, x.rh.id], areaPadraoId: x.rh.id })
    const res = await abrir(await headersDe(x.solicitante.id), problema.id)
    expect(res.statusCode).toBe(201)
    expect(res.json().area.id).toBe(x.rh.id)
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: x.ti.id })
    const equipe = await abrir(await headersDe(op.id), problema.id, {
      areaId: x.ti.id,
      solicitanteId: x.solicitante.id,
    })
    expect(equipe.statusCode).toBe(201)
  })

  it('destino fora da lista dá 422 (equipe escolhendo a área)', async () => {
    const x = await cenario()
    await prisma.areaDestino.create({ data: { areaOrigemId: x.origem.id, areaDestinoId: x.ti.id, padrao: false } })
    const problema = await criarProblema({ areaIds: [x.ti.id, x.rh.id], areaPadraoId: x.ti.id })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: x.ti.id })
    const headers = await headersDe(op.id)
    const fora = await abrir(headers, problema.id, { areaId: x.rh.id, solicitanteId: x.solicitante.id })
    expect(fora.statusCode).toBe(422)
    expect(fora.json().erro.codigo).toBe('REGRA_NEGOCIO')
    const dentro = await abrir(headers, problema.id, { areaId: x.ti.id, solicitanteId: x.solicitante.id })
    expect(dentro.statusCode).toBe(201)
  })

  it('USUARIO: usa o padrão do problema se permitido, senão o destino padrão; problema sem área permitida dá 422', async () => {
    const x = await cenario()
    await prisma.areaDestino.createMany({
      data: [
        { areaOrigemId: x.origem.id, areaDestinoId: x.ti.id, padrao: false },
        { areaOrigemId: x.origem.id, areaDestinoId: x.manutencao.id, padrao: true },
      ],
    })
    const headers = await headersDe(x.solicitante.id)
    // o padrão do problema (RH) não é destino: vale o destino padrão entre as áreas do problema
    const p1 = await criarProblema({ areaIds: [x.rh.id, x.ti.id, x.manutencao.id], areaPadraoId: x.rh.id })
    const r1 = await abrir(headers, p1.id)
    expect(r1.statusCode).toBe(201)
    expect(r1.json().area.id).toBe(x.manutencao.id)
    // o padrão do problema é destino permitido
    const p2 = await criarProblema({ areaIds: [x.ti.id, x.rh.id], areaPadraoId: x.ti.id })
    expect((await abrir(headers, p2.id)).json().area.id).toBe(x.ti.id)
    // nenhuma área do problema é destino permitido
    const p3 = await criarProblema({ areaIds: [x.rh.id], areaPadraoId: x.rh.id })
    const r3 = await abrir(headers, p3.id)
    expect(r3.statusCode).toBe(422)
    expect(r3.json().erro.codigo).toBe('REGRA_NEGOCIO')
  })

  it('meta devolve os destinosPermitidos do usuário (vazio sem restrição)', async () => {
    const x = await cenario()
    const antes = await app.inject({ method: 'GET', url: '/api/v1/meta', headers: await headersDe(x.solicitante.id) })
    expect(antes.json().destinosPermitidos).toEqual([])
    await prisma.areaDestino.create({ data: { areaOrigemId: x.origem.id, areaDestinoId: x.ti.id, padrao: true } })
    const depois = await app.inject({ method: 'GET', url: '/api/v1/meta', headers: await headersDe(x.solicitante.id) })
    expect(depois.json().destinosPermitidos).toEqual([{ areaId: x.ti.id, padrao: true }])
    const semArea = await app.inject({ method: 'GET', url: '/api/v1/meta', headers: x.hAdmin })
    expect(semArea.json().destinosPermitidos).toEqual([])
  })
})
