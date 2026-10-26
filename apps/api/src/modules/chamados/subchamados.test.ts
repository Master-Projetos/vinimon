import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado, criarProblema, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('subchamados (C20)', () => {
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

  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const opB = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const mk = (
      papel: Parameters<typeof criarChamado>[0]['papel'] = 'EM_ATENDIMENTO',
      operadorId: number | null = op.id,
    ) => criarChamado({ solicitanteId: solicitante.id, areaId: A.id, papel, operadorId })
    return { A, B, solicitante, op, opB, mk, headers: await headersDe(op.id) }
  }

  const versaoDe = async (id: number) =>
    (await prisma.chamado.findUniqueOrThrow({ where: { id }, select: { versao: true } })).versao
  const definir = async (id: number, headers: Record<string, string>, paiId: number | null) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/chamados/${id}/pai`,
      headers,
      payload: { versao: await versaoDe(id), paiId },
    })
  const concluir = async (id: number, headers: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/chamados/${id}/concluir`,
      headers,
      payload: { versao: await versaoDe(id), solucao: 'Problema resolvido com sucesso.' },
    })

  it('401, 403 para USUARIO, 400 com corpo inválido e 404 fora do escopo', async () => {
    const x = await cenario()
    const c = await x.mk()
    const sem = await app.inject({ method: 'POST', url: `/api/v1/chamados/${c.id}/pai`, payload: {} })
    expect([401, 403]).toContain(sem.statusCode)
    expect((await definir(c.id, await headersDe(x.solicitante.id), 1)).statusCode).toBe(403)
    const ruim = await app.inject({
      method: 'POST',
      url: `/api/v1/chamados/${c.id}/pai`,
      headers: x.headers,
      payload: { versao: 0, paiId: 'x', extra: true },
    })
    expect(ruim.statusCode).toBe(400)
    expect(ruim.json().erro.detalhes.length).toBeGreaterThan(0)
    expect((await definir(c.id, await headersDe(x.opB.id), null)).statusCode).toBe(404)
  })

  it('vincula e desvincula, com eventos internos nos dois chamados e pai/filhos no detalhe', async () => {
    const x = await cenario()
    const pai = await x.mk()
    const filho = await x.mk()
    const r = await definir(filho.id, x.headers, pai.id)
    expect(r.statusCode).toBe(200)
    expect(r.json().pai).toMatchObject({ id: pai.id })
    const detalhePai = await app.inject({ method: 'GET', url: `/api/v1/chamados/${pai.id}`, headers: x.headers })
    expect(detalhePai.json().filhos).toEqual([expect.objectContaining({ id: filho.id })])
    for (const id of [pai.id, filho.id]) {
      const ev = await prisma.chamadoEvento.findMany({
        where: { chamadoId: id, tipo: 'SUBCHAMADO_VINCULADO' },
        select: { interno: true },
      })
      expect(ev).toEqual([{ interno: true }])
    }
    expect((await definir(filho.id, x.headers, pai.id)).statusCode).toBe(422)

    const d = await definir(filho.id, x.headers, null)
    expect(d.statusCode).toBe(200)
    expect(d.json().pai ?? null).toBeNull()
    expect(await prisma.chamadoEvento.count({ where: { tipo: 'SUBCHAMADO_DESVINCULADO' } })).toBe(2)
    expect((await definir(filho.id, x.headers, null)).statusCode).toBe(422)
  })

  it('o ciclo A→B→A dá 422, assim como ligar um chamado a si mesmo ou por uma cadeia longa', async () => {
    const x = await cenario()
    const a = await x.mk()
    const b = await x.mk()
    const c = await x.mk()
    expect((await definir(a.id, x.headers, b.id)).statusCode).toBe(200) // a é filho de b
    const ciclo = await definir(b.id, x.headers, a.id)
    expect(ciclo.statusCode).toBe(422)
    expect(ciclo.json().erro.codigo).toBe('REGRA_NEGOCIO')
    expect((await definir(b.id, x.headers, c.id)).statusCode).toBe(200)
    expect((await definir(c.id, x.headers, a.id)).statusCode).toBe(422) // c → b → c? a→b→c fecharia o laço
    expect((await definir(a.id, x.headers, a.id)).statusCode).toBe(422)
    // trocar de pai desvincula o antigo
    expect((await definir(a.id, x.headers, c.id)).statusCode).toBe(200)
    expect(await prisma.chamadoEvento.count({ where: { chamadoId: b.id, tipo: 'SUBCHAMADO_DESVINCULADO' } })).toBe(1)
  })

  it('precisa ver e atender o pai; pai encerrado não aceita filho', async () => {
    const x = await cenario()
    const filho = await x.mk()
    const deOutraArea = await criarChamado({ solicitanteId: x.solicitante.id, areaId: x.B.id })
    expect((await definir(filho.id, x.headers, deOutraArea.id)).statusCode).toBe(404)
    const encerrado = await x.mk('ENCERRADO')
    expect((await definir(filho.id, x.headers, encerrado.id)).statusCode).toBe(422)
  })

  it('concluir o pai com filho não encerrado dá 422; com filho encerrado, passa', async () => {
    const x = await cenario()
    const pai = await x.mk()
    const filho = await x.mk()
    await definir(filho.id, x.headers, pai.id)
    const bloqueado = await concluir(pai.id, x.headers)
    expect(bloqueado.statusCode).toBe(422)
    expect(bloqueado.json().erro.mensagem).toBe('Conclua os subchamados antes.')
    // concluído mas ainda aguardando validação não basta: o filho precisa estar ENCERRADO
    expect((await concluir(filho.id, x.headers)).statusCode).toBe(200)
    expect((await concluir(pai.id, x.headers)).statusCode).toBe(422)
    const encerrado = await x.mk('ENCERRADO')
    await prisma.chamado.update({ where: { id: filho.id }, data: { chamadoPaiId: null } })
    await prisma.chamado.update({ where: { id: encerrado.id }, data: { chamadoPaiId: pai.id } })
    expect((await concluir(pai.id, x.headers)).statusCode).toBe(200)
  })

  it('POST /chamados aceita paiId: o subchamado nasce vinculado; sem atender o pai dá 403 e pai inexistente dá 400', async () => {
    const x = await cenario()
    const problema = await criarProblema({ areaIds: [x.A.id], areaPadraoId: x.A.id })
    const pai = await x.mk()
    const corpo = { assunto: 'Subchamado de teste', descricao: 'Descrição do subchamado.', problemaId: problema.id }
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/chamados',
      headers: x.headers,
      payload: { ...corpo, paiId: pai.id },
    })
    expect(ok.statusCode).toBe(201)
    expect(ok.json().pai).toMatchObject({ id: pai.id })
    expect(await prisma.chamadoEvento.count({ where: { chamadoId: pai.id, tipo: 'SUBCHAMADO_VINCULADO' } })).toBe(1)

    const semAtender = await app.inject({
      method: 'POST',
      url: '/api/v1/chamados',
      headers: await headersDe(x.solicitante.id),
      payload: { ...corpo, paiId: pai.id },
    })
    expect(semAtender.statusCode).toBe(403) // o solicitante vê o pai (é dono), mas não o atende
    const inexistente = await app.inject({
      method: 'POST',
      url: '/api/v1/chamados',
      headers: x.headers,
      payload: { ...corpo, paiId: 999_999 },
    })
    expect(inexistente.statusCode).toBe(400)
  })

  it('o detalhe só mostra pai e filhos que quem consulta pode ver', async () => {
    const x = await cenario()
    const pai = await x.mk()
    const filho = await x.mk()
    await definir(filho.id, x.headers, pai.id)
    // um filho em outra área, aberto por quem atende as duas
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const filhoB = await criarChamado({ solicitanteId: x.solicitante.id, areaId: x.B.id })
    expect((await definir(filhoB.id, await headersDe(admin.id), pai.id)).statusCode).toBe(200)
    const visto = await app.inject({ method: 'GET', url: `/api/v1/chamados/${pai.id}`, headers: x.headers })
    expect(visto.json().filhos.map((f: { id: number }) => f.id)).toEqual([filho.id])
    const adminVe = await app.inject({
      method: 'GET',
      url: `/api/v1/chamados/${pai.id}`,
      headers: await headersDe(admin.id),
    })
    expect(
      adminVe
        .json()
        .filhos.map((f: { id: number }) => f.id)
        .sort(),
    ).toEqual([filho.id, filhoB.id].sort())
  })
})
