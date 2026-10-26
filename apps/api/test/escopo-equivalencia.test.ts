import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type App, buildApp } from '../src/app'
import { comAuxiliarIds, escopoChamados, podeVerChamado, selectEscopo } from '../src/autorizacao/chamados'
import { invalidarConfig } from '../src/lib/config'
import { prisma } from '../src/lib/prisma'
import { carregarSessao, type UsuarioSessao } from '../src/lib/sessao'
import { criarArea, criarUsuario, headersDe, limparBanco } from './ajudantes'
import { criarChamado, semearBase } from './fabricas'

type Ator =
  | 'solicitante'
  | 'outroUsuario'
  | 'operadorDaArea'
  | 'operadorSecundario'
  | 'operadorOutraArea'
  | 'responsavelOutraArea'
  | 'admin'
  | 'operadorSemIsolamento'
  | 'auxiliarOutraArea'

describe('escopoChamados (Prisma) e podeVerChamado (TS) devolvem o mesmo conjunto (T33)', () => {
  const atores = {} as Record<Ator, UsuarioSessao>
  let chamados: Array<{
    id: number
    areaId: number
    operadorId: number | null
    solicitanteId: number
    auxiliarIds: number[]
  }> = []

  beforeAll(async () => {
    await limparBanco()
    await semearBase()
    const A = await criarArea()
    const B = await criarArea()
    const C = await criarArea()
    const D = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const outroUsuario = await criarUsuario({ perfil: 'USUARIO' })
    const operadorDaArea = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const operadorSecundario = await criarUsuario({ perfil: 'OPERADOR', areaId: C.id })
    await prisma.usuarioArea.create({ data: { usuarioId: operadorSecundario.id, areaId: A.id } })
    const operadorOutraArea = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const responsavelOutraArea = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const auxiliarOutraArea = await criarUsuario({ perfil: 'OPERADOR', areaId: D.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const usuarios = {
      solicitante,
      outroUsuario,
      operadorDaArea,
      operadorSecundario,
      operadorOutraArea,
      responsavelOutraArea,
      auxiliarOutraArea,
      admin,
    }
    for (const [nome, u] of Object.entries(usuarios) as Array<[Ator, { id: number }]>) {
      const { cookie } = await headersDe(u.id)
      const token = cookie.split('=')[1]
      const sessao = await carregarSessao(token, { tocar: false })
      if (!sessao) throw new Error(`sessão não carregou para ${nome}`)
      atores[nome] = sessao
    }
    // T-13.2: operador de outra área com `chamado.isolarAreas` desligado (a sessão já nasce com `verTodasAreas`)
    const semIsolamento = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    await definirIsolamento(false)
    const sessaoSem = await carregarSessao((await headersDe(semIsolamento.id)).cookie.split('=')[1], { tocar: false })
    await definirIsolamento(true)
    if (!sessaoSem?.verTodasAreas) throw new Error('a sessão do operador sem isolamento não ganhou verTodasAreas')
    atores.operadorSemIsolamento = sessaoSem

    const novo = (dados: Parameters<typeof criarChamado>[0]) => criarChamado(dados)
    const criados = [
      await novo({ solicitanteId: solicitante.id, areaId: A.id, papel: 'INICIAL' }), // área primária do operador da A
      await novo({
        solicitanteId: solicitante.id,
        areaId: A.id,
        papel: 'EM_ATENDIMENTO',
        operadorId: operadorDaArea.id,
      }),
      await novo({ solicitanteId: outroUsuario.id, areaId: A.id, papel: 'INICIAL' }),
      await novo({ solicitanteId: solicitante.id, areaId: C.id, papel: 'INICIAL' }), // área primária do secundário
      await novo({ solicitanteId: solicitante.id, areaId: B.id, papel: 'INICIAL' }), // outra área
      await novo({
        solicitanteId: outroUsuario.id,
        areaId: B.id,
        papel: 'EM_ATENDIMENTO',
        operadorId: operadorOutraArea.id,
      }),
      await novo({
        solicitanteId: solicitante.id,
        areaId: A.id,
        papel: 'EM_ATENDIMENTO',
        operadorId: responsavelOutraArea.id,
      }), // responsável de outra área
      await novo({ solicitanteId: operadorOutraArea.id, areaId: A.id, papel: 'INICIAL' }), // solicitante OPERADOR
      await novo({ solicitanteId: operadorDaArea.id, areaId: B.id, papel: 'INICIAL' }), // solicitante OPERADOR em outra área
      await novo({ solicitanteId: solicitante.id, areaId: A.id, papel: 'ENCERRADO', operadorId: operadorDaArea.id }),
      await novo({ solicitanteId: outroUsuario.id, areaId: C.id, papel: 'CANCELADO' }),
      await novo({
        solicitanteId: solicitante.id,
        areaId: B.id,
        papel: 'CONCLUIDO',
        operadorId: responsavelOutraArea.id,
      }),
    ]
    // T-15.1: operador de outra área é auxiliar de um chamado (o primeiro) e de nenhum outro
    const primeiro = criados[0]
    if (!primeiro) throw new Error('a fixture não criou chamados')
    await prisma.chamadoAuxiliar.create({ data: { chamadoId: primeiro.id, usuarioId: auxiliarOutraArea.id } })
    chamados = (
      await prisma.chamado.findMany({
        where: { id: { in: criados.map((c) => c.id) } },
        select: { id: true, ...selectEscopo },
        orderBy: { id: 'asc' },
      })
    ).map((c) => comAuxiliarIds(c))
  })

  const ids = (xs: Array<{ id: number }>) => xs.map((x) => x.id).sort((a, b) => a - b)

  it('a fixture tem 12 chamados', () => {
    expect(chamados).toHaveLength(12)
  })

  it.each([
    'solicitante',
    'outroUsuario',
    'operadorDaArea',
    'operadorSecundario',
    'operadorOutraArea',
    'responsavelOutraArea',
    'admin',
    'operadorSemIsolamento',
    'auxiliarOutraArea',
  ] as const)('T33: ator %s: mesmo conjunto no Prisma e em memória', async (nome) => {
    const u = atores[nome]
    const noBanco = ids(await prisma.chamado.findMany({ where: escopoChamados(u), select: { id: true } }))
    const emMemoria = ids(chamados.filter((c) => podeVerChamado(u, c)))
    expect(noBanco).toEqual(emMemoria)
  })

  it('os conjuntos não são triviais: ninguém vê tudo, exceto o ADMIN, e há quem veja alguns', () => {
    const vistos = (nome: Ator) => chamados.filter((c) => podeVerChamado(atores[nome], c)).length
    expect(vistos('admin')).toBe(12)
    expect(vistos('operadorOutraArea')).toBeGreaterThan(0)
    expect(vistos('operadorOutraArea')).toBeLessThan(12)
    expect(vistos('solicitante')).toBeLessThan(12)
    expect(vistos('operadorSemIsolamento')).toBe(12)
    expect(vistos('auxiliarOutraArea')).toBe(1)
  })
})

async function definirIsolamento(valor: boolean) {
  await prisma.config.upsert({
    where: { chave: 'chamado.isolarAreas' },
    create: { chave: 'chamado.isolarAreas', valor },
    update: { valor },
  })
  invalidarConfig()
}

describe('chamado.isolarAreas (T-13.2)', () => {
  let app: App
  beforeAll(async () => {
    app = await buildApp()
  })
  afterAll(async () => {
    await definirIsolamento(true)
    await app.close()
  })

  async function cenario() {
    await limparBanco()
    await semearBase()
    const A = await criarArea()
    const B = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const operadorB = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const c = await criarChamado({ solicitanteId: solicitante.id, areaId: A.id, papel: 'INICIAL' })
    const versao = (await prisma.chamado.findUniqueOrThrow({ where: { id: c.id }, select: { versao: true } })).versao
    return { c, versao, headers: await headersDe(operadorB.id) }
  }

  it('com true (padrão), o operador de outra área recebe 404 no detalhe e ao assumir', async () => {
    const x = await cenario()
    await definirIsolamento(true)
    const detalhe = await app.inject({ method: 'GET', url: `/api/v1/chamados/${x.c.id}`, headers: x.headers })
    expect(detalhe.statusCode).toBe(404)
    const assumir = await app.inject({
      method: 'POST',
      url: `/api/v1/chamados/${x.c.id}/assumir`,
      headers: x.headers,
      payload: { versao: x.versao },
    })
    expect(assumir.statusCode).toBe(404)
  })

  it('com false, o operador vê o chamado de outra área (lista e detalhe) e recebe 403 ao assumir', async () => {
    const x = await cenario()
    await definirIsolamento(false)
    const detalhe = await app.inject({ method: 'GET', url: `/api/v1/chamados/${x.c.id}`, headers: x.headers })
    expect(detalhe.statusCode).toBe(200)
    const lista = await app.inject({ method: 'GET', url: '/api/v1/chamados', headers: x.headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json().itens.map((i: { id: number }) => i.id)).toContain(x.c.id)
    const assumir = await app.inject({
      method: 'POST',
      url: `/api/v1/chamados/${x.c.id}/assumir`,
      headers: x.headers,
      payload: { versao: x.versao },
    })
    expect(assumir.statusCode).toBe(403)
  })

  it('com false, o USUARIO continua vendo só o que é dele', async () => {
    const x = await cenario()
    const outro = await criarUsuario({ perfil: 'USUARIO' })
    await definirIsolamento(false)
    const r = await app.inject({ method: 'GET', url: `/api/v1/chamados/${x.c.id}`, headers: await headersDe(outro.id) })
    expect(r.statusCode).toBe(404)
  })
})
