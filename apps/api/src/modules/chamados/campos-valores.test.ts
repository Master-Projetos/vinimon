import type { TipoCampo, VisibilidadeCampo } from '@vinimon/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { criarChamado, criarProblema, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('valores de campos personalizados no chamado (B11, T-14.3)', () => {
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

  const criarCampo = (d: { chave: string; tipo: TipoCampo; obrigatorio?: boolean; visibilidade?: VisibilidadeCampo }) =>
    prisma.campoPersonalizado.create({
      data: {
        chave: d.chave,
        rotulo: `Rótulo ${d.chave}`,
        tipo: d.tipo,
        opcoes: [],
        obrigatorio: d.obrigatorio ?? false,
        visibilidade: d.visibilidade ?? 'ABERTURA',
        ordem: 0,
        ativo: true,
      },
      select: { id: true },
    })

  /** U1 é o solicitante; O1 atende a área A; O2 é de outra área (B). Problema atendido só pela área A. */
  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const problema = await criarProblema({ areaIds: [A.id], areaPadraoId: A.id })
    const u1 = await criarUsuario({ perfil: 'USUARIO' })
    const o1 = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const o2 = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const chamado = await criarChamado({
      solicitanteId: u1.id,
      areaId: A.id,
      papel: 'EM_ATENDIMENTO',
      operadorId: o1.id,
      problemaId: problema.id,
    })
    return {
      problema,
      u1,
      o1,
      o2,
      chamado,
      hU1: await headersDe(u1.id),
      hO1: await headersDe(o1.id),
      hO2: await headersDe(o2.id),
    }
  }

  const versaoDe = async (id: number) => (await prisma.chamado.findUniqueOrThrow({ where: { id } })).versao
  const put = (id: number, headers: Record<string, string>, payload: Record<string, unknown>) =>
    app.inject({ method: 'PUT', url: `/api/v1/chamados/${id}/campos`, headers, payload })

  it('POST /chamados: obrigatório ausente dá 400 em campos.<chave>; com valor, grava e devolve', async () => {
    const x = await cenario()
    await criarCampo({ chave: 'orcamento', tipo: 'NUMERO', obrigatorio: true })
    const corpo = { assunto: 'Compra de monitor', descricao: 'Preciso de um monitor novo.', problemaId: x.problema.id }

    const semValor = await app.inject({
      method: 'POST',
      url: '/api/v1/chamados',
      headers: x.hU1,
      payload: { ...corpo, campos: {} },
    })
    expect(semValor.statusCode).toBe(400)
    expect(semValor.json().erro.detalhes).toEqual([
      expect.objectContaining({ campo: 'campos.orcamento', mensagem: 'Campo obrigatório.' }),
    ])

    const comValor = await app.inject({
      method: 'POST',
      url: '/api/v1/chamados',
      headers: x.hU1,
      payload: { ...corpo, campos: { orcamento: 150 } },
    })
    expect(comValor.statusCode).toBe(201)
    expect(comValor.json().campos).toEqual([
      expect.objectContaining({ chave: 'orcamento', tipo: 'NUMERO', valor: 150 }),
    ])
  })

  it('PUT /chamados/:id/campos: 401 sem sessão, 403 para quem não atende, 404 fora do escopo', async () => {
    const x = await cenario()
    await criarCampo({ chave: 'orcamento', tipo: 'NUMERO' })
    const payload = { versao: await versaoDe(x.chamado.id), campos: { orcamento: 1 } }

    const anonimo = await put(x.chamado.id, { origin: ORIGEM }, payload)
    expect(anonimo.statusCode).toBe(401)
    expect(anonimo.json().erro.codigo).toBe('NAO_AUTENTICADO')

    const solicitante = await put(x.chamado.id, x.hU1, payload)
    expect(solicitante.statusCode).toBe(403)

    const foraDoEscopo = await put(x.chamado.id, x.hO2, payload)
    expect(foraDoEscopo.statusCode).toBe(404)
    const inexistente = await put(999_999, x.hO1, payload)
    expect(inexistente.statusCode).toBe(404)
  })

  it('PUT: 409 com versão antiga; 400 com detalhes quando falta obrigatório', async () => {
    const x = await cenario()
    await criarCampo({ chave: 'contrato', tipo: 'TEXTO', obrigatorio: true })
    const versao = await versaoDe(x.chamado.id)

    const obrigatorio = await put(x.chamado.id, x.hO1, { versao, campos: {} })
    expect(obrigatorio.statusCode).toBe(400)
    expect(obrigatorio.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'campos.contrato' })])

    const antiga = await put(x.chamado.id, x.hO1, { versao: versao + 5, campos: { contrato: 'ABC-1' } })
    expect(antiga.statusCode).toBe(409)
    expect(antiga.json().erro.codigo).toBe('CONFLITO')
  })

  it('PUT: a alteração gera CAMPOS_ALTERADOS {chave, de, para}; sem mudança não gera evento nem sobe a versão', async () => {
    const x = await cenario()
    await criarCampo({ chave: 'orcamento', tipo: 'NUMERO' })
    const versao = await versaoDe(x.chamado.id)

    const ok = await put(x.chamado.id, x.hO1, { versao, campos: { orcamento: 42 } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().campos).toEqual([expect.objectContaining({ chave: 'orcamento', valor: 42 })])

    const eventos = await prisma.chamadoEvento.findMany({
      where: { chamadoId: x.chamado.id, tipo: 'CAMPOS_ALTERADOS' },
    })
    expect(eventos).toHaveLength(1)
    expect(eventos[0]?.dados).toEqual({ chave: 'orcamento', de: null, para: 42 })

    // mesmo valor de novo: nada muda, nada é gravado, versão igual
    const igual = await put(x.chamado.id, x.hO1, { versao: versao + 1, campos: { orcamento: 42 } })
    expect(igual.statusCode).toBe(200)
    expect(await versaoDe(x.chamado.id)).toBe(versao + 1)
    expect(await prisma.chamadoEvento.count({ where: { chamadoId: x.chamado.id, tipo: 'CAMPOS_ALTERADOS' } })).toBe(1)
  })

  it('filtro campo.<chave>: igual e faixa de/ate para número; 400 para tipo fora da lista', async () => {
    const x = await cenario()
    const num = await criarCampo({ chave: 'valor_num', tipo: 'NUMERO' })
    await criarCampo({ chave: 'ok_marcado', tipo: 'CHECKBOX' })
    const chamados: number[] = []
    for (const n of [10, 20, 30]) {
      const c = await criarChamado({
        solicitanteId: x.u1.id,
        areaId: x.chamado.areaId,
        papel: 'EM_ATENDIMENTO',
        operadorId: x.o1.id,
        problemaId: x.problema.id,
      })
      chamados.push(c.id)
      await prisma.chamadoCampoValor.create({ data: { chamadoId: c.id, campoId: num.id, valorNumero: n } })
    }
    const lista = async (qs: string) => {
      return app.inject({ method: 'GET', url: `/api/v1/chamados?${qs}`, headers: x.hO1 })
    }

    const igual = await lista('campo.valor_num=20')
    expect(igual.statusCode).toBe(200)
    expect(igual.json().itens.map((i: { id: number }) => i.id)).toEqual([chamados[1]])

    const faixa = await lista('campo.valor_num.de=15&campo.valor_num.ate=40')
    expect(faixa.statusCode).toBe(200)
    expect(
      faixa
        .json()
        .itens.map((i: { id: number }) => i.id)
        .sort(),
    ).toEqual([chamados[1], chamados[2]].sort())

    const proibido = await lista('campo.ok_marcado=true')
    expect(proibido.statusCode).toBe(400)
    expect(proibido.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'campo.ok_marcado' })])
  })

  it('campo OCULTO_SOLICITANTE: o solicitante não vê o valor no detalhe nem o pode filtrar; o operador vê', async () => {
    const x = await cenario()
    const oculto = await criarCampo({ chave: 'nota_interna', tipo: 'TEXTO', visibilidade: 'OCULTO_SOLICITANTE' })
    await prisma.chamadoCampoValor.create({
      data: { chamadoId: x.chamado.id, campoId: oculto.id, valorTexto: 'segredo' },
    })

    const doSolicitante = await app.inject({ method: 'GET', url: `/api/v1/chamados/${x.chamado.id}`, headers: x.hU1 })
    expect(doSolicitante.statusCode).toBe(200)
    expect(doSolicitante.json().campos).toEqual([])

    const doOperador = await app.inject({ method: 'GET', url: `/api/v1/chamados/${x.chamado.id}`, headers: x.hO1 })
    expect(doOperador.json().campos).toEqual([expect.objectContaining({ chave: 'nota_interna', valor: 'segredo' })])

    const filtroDoSolicitante = await app.inject({
      method: 'GET',
      url: '/api/v1/chamados?campo.nota_interna=segredo',
      headers: x.hU1,
    })
    expect(filtroDoSolicitante.statusCode).toBe(400)
    expect(filtroDoSolicitante.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'campo.nota_interna' })])
  })
})
