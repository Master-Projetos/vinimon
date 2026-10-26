import { Readable } from 'node:stream'
import type {
  DetalheAvaliacoes,
  DetalheSla,
  LinhaRelatorio,
  LinhaSla,
  Relatorio,
  RelatorioQuery,
  TipoRelatorio,
} from '@vinimon/shared'
import { BOM_CSV, NOTAS_AVALIACAO } from '@vinimon/shared'
import { DateTime } from 'luxon'
import { escopoChamados } from '../../autorizacao/chamados'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import { obterConfig } from '../../lib/config'
import type { ContextoUsuario } from '../../lib/contexto'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'
import { linhasDoCsv } from './csv'

type Dimensao = Exclude<TipoRelatorio, 'visao-geral' | 'sla' | 'avaliacoes'>
const LIMITE_LINHAS = 200

const CAMPO: Record<Dimensao, 'statusId' | 'areaId' | 'problemaId' | 'operadorId' | 'solicitanteId'> = {
  'por-status': 'statusId',
  'por-area': 'areaId',
  'por-problema': 'problemaId',
  'por-operador': 'operadorId',
  'por-solicitante': 'solicitanteId',
}
const SEM: Record<Dimensao, string> = {
  'por-status': 'Sem status',
  'por-area': 'Sem área',
  'por-problema': 'Sem tipo de problema',
  'por-operador': 'Sem operador',
  'por-solicitante': 'Sem solicitante',
}

const arredondar = (n: number) => Math.round(n * 10) / 10

function indicadores(total: number, encerrados: number, noPrazo: number, foraDoPrazo: number, media: number | null) {
  const base = noPrazo + foraDoPrazo
  return {
    total,
    encerrados,
    pctNoPrazo: base === 0 ? null : arredondar((noPrazo / base) * 100),
    tempoMedioSolucaoUtilMin: media === null ? null : Math.round(media),
  }
}

/** Período em dias de calendário do fuso do sistema; sem datas, os últimos 30 dias. */
export async function periodoDe(q: RelatorioQuery, agora: Date) {
  const fuso = (await obterConfig())['sistema.fusoHorario']
  const fim = q.ate ? DateTime.fromISO(q.ate, { zone: fuso }) : DateTime.fromJSDate(agora, { zone: fuso })
  const inicio = q.de ? DateTime.fromISO(q.de, { zone: fuso }) : fim.minus({ days: 29 })
  return {
    de: inicio.toFormat('yyyy-MM-dd'),
    ate: fim.toFormat('yyyy-MM-dd'),
    inicio: inicio.startOf('day').toJSDate(),
    fim: fim.endOf('day').toJSDate(),
  }
}

/** `AND: [escopo, cancelados fora, status ignorado fora, filtros, período]`: o escopo nunca é ampliado (S58, S45). */
export function whereDoRelatorio(
  u: UsuarioSessao,
  q: RelatorioQuery,
  inicio: Date,
  fim: Date,
): Prisma.ChamadoWhereInput {
  return {
    AND: [
      escopoChamados(u),
      { cancelado: false, status: { ignorado: false } },
      q.areaId === undefined ? {} : { areaId: q.areaId },
      q.operadorId === undefined ? {} : { operadorId: q.operadorId },
      { abertoEm: { gte: inicio, lte: fim } },
    ],
  }
}

interface Acumulado {
  total: number
  encerrados: number
  respSim: number
  respNao: number
  solSim: number
  solNao: number
  somaTempo: number
  nTempo: number
}

const vazio = (): Acumulado => ({
  total: 0,
  encerrados: 0,
  respSim: 0,
  respNao: 0,
  solSim: 0,
  solNao: 0,
  somaTempo: 0,
  nTempo: 0,
})

interface GrupoBruto {
  statusTipo: string
  slaRespostaCumprido: boolean | null
  slaSolucaoCumprido: boolean | null
  _count: { _all: number; tempoSolucaoUtilMin: number }
  _sum: { tempoSolucaoUtilMin: number | null }
}

function somarGrupo(a: Acumulado, g: GrupoBruto) {
  const n = g._count._all
  a.total += n
  if (g.statusTipo === 'ENCERRADO') a.encerrados += n
  if (g.slaRespostaCumprido === true) a.respSim += n
  else if (g.slaRespostaCumprido === false) a.respNao += n
  if (g.slaSolucaoCumprido === true) a.solSim += n
  else if (g.slaSolucaoCumprido === false) a.solNao += n
  a.somaTempo += g._sum.tempoSolucaoUtilMin ?? 0
  a.nTempo += g._count.tempoSolucaoUtilMin
}

const indicadoresDe = (a: Acumulado) =>
  indicadores(a.total, a.encerrados, a.solSim, a.solNao, a.nTempo === 0 ? null : a.somaTempo / a.nTempo)

const AGREGADOS = {
  _count: { _all: true, tempoSolucaoUtilMin: true },
  _sum: { tempoSolucaoUtilMin: true },
} as const

const ordemId = (a: number | null, b: number | null) => (a === null ? 1 : b === null ? -1 : a - b)

/** Uma única varredura: agrupa por `campo` + status/SLA e soma em memória (totais e dimensão saem da mesma consulta). */
async function agregar(
  campo: 'areaId' | 'problemaId' | 'statusId' | 'operadorId' | 'solicitanteId',
  where: Prisma.ChamadoWhereInput,
) {
  const grupos = await prisma.chamado.groupBy({
    by: [campo, 'statusTipo', 'slaRespostaCumprido', 'slaSolucaoCumprido'],
    where,
    ...AGREGADOS,
  })
  const chaveDe = (v: number | null) => (v === null ? 'sem' : String(v))
  const porChave = new Map<string, { id: number | null; acc: Acumulado }>()
  const geral = vazio()
  for (const g of grupos) {
    const id = g[campo]
    const k = chaveDe(id)
    const atual = porChave.get(k) ?? { id, acc: vazio() }
    somarGrupo(atual.acc, g)
    somarGrupo(geral, g)
    porChave.set(k, atual)
  }
  const ordenadas = [...porChave.entries()]
    .sort(([ka, a], [kb, b]) => b.acc.total - a.acc.total || ordemId(a.id, b.id) || ka.localeCompare(kb))
    .slice(0, LIMITE_LINHAS)
  return { geral, linhas: ordenadas.map(([chave, v]) => ({ chave, id: v.id, acc: v.acc })) }
}

async function totaisDe(where: Prisma.ChamadoWhereInput) {
  const grupos = await prisma.chamado.groupBy({
    by: ['statusTipo', 'slaRespostaCumprido', 'slaSolucaoCumprido'],
    where,
    ...AGREGADOS,
  })
  const geral = vazio()
  for (const g of grupos) somarGrupo(geral, g)
  return indicadoresDe(geral)
}

async function nomesDe(dim: Dimensao, ids: number[]): Promise<Map<number, string>> {
  const pares = async () => {
    switch (dim) {
      case 'por-status':
        return prisma.status.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })
      case 'por-area':
        return prisma.area.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })
      case 'por-problema':
        return prisma.problema.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })
      default:
        return prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })
    }
  }
  return new Map((await pares()).map((p) => [p.id, p.nome]))
}

async function porDimensao(
  dim: Dimensao,
  where: Prisma.ChamadoWhereInput,
  pronto?: Agregado,
): Promise<LinhaRelatorio[]> {
  const { linhas } = pronto ?? (await agregar(CAMPO[dim], where))
  const nomes = await nomesDe(
    dim,
    linhas.flatMap((l) => (l.id === null ? [] : [l.id])),
  )
  return linhas.map((l) => ({
    chave: l.chave,
    nome: l.id === null ? SEM[dim] : (nomes.get(l.id) ?? `#${l.id}`),
    ...indicadoresDe(l.acc),
  }))
}

type Agregado = Awaited<ReturnType<typeof agregar>>

const pct = (parte: number, base: number) => (base === 0 ? null : arredondar((parte / base) * 100))

/** Percentuais de SLA agrupados por `campo`; o denominador de cada meta é só quem tem o valor não nulo. */
async function slaPor(
  campo: 'areaId' | 'problemaId',
  where: Prisma.ChamadoWhereInput,
  pronto?: Agregado,
): Promise<LinhaSla[]> {
  const { linhas } = pronto ?? (await agregar(campo, where))
  const dim: Dimensao = campo === 'areaId' ? 'por-area' : 'por-problema'
  const nomes = await nomesDe(
    dim,
    linhas.flatMap((l) => (l.id === null ? [] : [l.id])),
  )
  return linhas.map((l) => ({
    chave: l.chave,
    nome: l.id === null ? SEM[dim] : (nomes.get(l.id) ?? `#${l.id}`),
    total: l.acc.total,
    comMetaResposta: l.acc.respSim + l.acc.respNao,
    pctRespostaNoPrazo: pct(l.acc.respSim, l.acc.respSim + l.acc.respNao),
    comMetaSolucao: l.acc.solSim + l.acc.solNao,
    pctSolucaoNoPrazo: pct(l.acc.solSim, l.acc.solSim + l.acc.solNao),
  }))
}

async function detalheSla(where: Prisma.ChamadoWhereInput, area: Agregado): Promise<DetalheSla> {
  const [porArea, porProblema] = await Promise.all([slaPor('areaId', where, area), slaPor('problemaId', where)])
  return { porArea, porProblema }
}

const PESO_NOTA = { OTIMO: 4, BOM: 3, REGULAR: 2, RUIM: 1 } as const

/** Avaliações dos chamados do escopo (o `where` do chamado entra como filtro de relação, nunca ampliado). */
async function detalheAvaliacoes(where: Prisma.ChamadoWhereInput): Promise<DetalheAvaliacoes> {
  const dasAvaliacoes: Prisma.AvaliacaoChamadoWhereInput = { chamado: where }
  const [porNota, automaticas, ...porOperadorPorNota] = await Promise.all([
    prisma.avaliacaoChamado.groupBy({ by: ['nota'], where: dasAvaliacoes, _count: { _all: true } }),
    prisma.avaliacaoChamado.count({ where: { AND: [dasAvaliacoes, { automatica: true }] } }),
    ...NOTAS_AVALIACAO.map((nota) =>
      prisma.chamado.groupBy({
        by: ['operadorId'],
        where: { AND: [where, { avaliacao: { is: { nota } } }] },
        _count: { _all: true },
      }),
    ),
  ])
  const distribuicao = NOTAS_AVALIACAO.map((nota) => ({
    nota,
    total: porNota.find((g) => g.nota === nota)?._count._all ?? 0,
  }))
  const avaliadas = distribuicao.reduce((s, d) => s + d.total, 0)
  const somaGeral = distribuicao.reduce((s, d) => s + d.total * PESO_NOTA[d.nota], 0)

  const acumulado = new Map<string, { id: number | null; n: number; soma: number }>()
  NOTAS_AVALIACAO.forEach((nota, i) => {
    for (const g of porOperadorPorNota[i] ?? []) {
      const k = g.operadorId === null ? 'sem' : String(g.operadorId)
      const a = acumulado.get(k) ?? { id: g.operadorId, n: 0, soma: 0 }
      a.n += g._count._all
      a.soma += g._count._all * PESO_NOTA[nota]
      acumulado.set(k, a)
    }
  })
  const ids = [...acumulado.values()].flatMap((a) => (a.id === null ? [] : [a.id]))
  const nomes = await nomesDe('por-operador', ids)
  const mediaPorOperador = [...acumulado.entries()]
    .map(([chave, a]) => ({
      chave,
      nome: a.id === null ? SEM['por-operador'] : (nomes.get(a.id) ?? `#${a.id}`),
      avaliadas: a.n,
      media: Math.round((a.soma / a.n) * 100) / 100,
    }))
    .sort((x, y) => y.avaliadas - x.avaliadas || x.nome.localeCompare(y.nome, 'pt-BR'))
    .slice(0, LIMITE_LINHAS)
  return {
    avaliadas,
    distribuicao,
    pctAutomaticas: pct(automaticas, avaliadas),
    mediaGeral: avaliadas === 0 ? null : Math.round((somaGeral / avaliadas) * 100) / 100,
    mediaPorOperador,
  }
}

/**
 * `GET /relatorios/:tipo`. `sla` usa `linhas` por área (como `por-area`) e `avaliacoes` por operador (como
 * `por-operador`), para `totais`/`linhas` somarem o mesmo escopo nos 8 tipos; o detalhe vem em `sla`/`avaliacoes`.
 */
export async function gerarRelatorio(
  u: UsuarioSessao,
  tipo: TipoRelatorio,
  q: RelatorioQuery,
  agora = new Date(),
): Promise<Relatorio> {
  const p = await periodoDe(q, agora)
  const where = whereDoRelatorio(u, q, p.inicio, p.fim)
  // Relatórios por dimensão: totais e linhas saem da mesma varredura (agregado já cobre todas as dimensões).
  const dim = tipo === 'visao-geral' || tipo === 'avaliacoes' ? null : tipo === 'sla' ? 'por-area' : tipo
  const agregado = dim === null ? undefined : await agregar(CAMPO[dim], where)
  const totais = agregado ? indicadoresDe(agregado.geral) : await totaisDe(where)
  const base = { tipo, de: p.de, ate: p.ate, totais }
  switch (tipo) {
    case 'visao-geral':
      return { ...base, linhas: [{ chave: 'geral', nome: 'Visão geral', ...totais }] }
    case 'sla':
      return {
        ...base,
        linhas: await porDimensao('por-area', where, agregado),
        sla: await detalheSla(where, agregado ?? (await agregar('areaId', where))),
      }
    case 'avaliacoes':
      return { ...base, linhas: await porDimensao('por-operador', where), avaliacoes: await detalheAvaliacoes(where) }
    default:
      return { ...base, linhas: await porDimensao(tipo, where, agregado) }
  }
}

/**
 * `GET /relatorios/:tipo/csv`: o relatório é calculado ANTES do stream (mesmo escopo de `gerarRelatorio`, então erros
 * saem como HTTP normal). A auditoria `exportacao.csv` (S87) leva só `{tipo, filtros, linhas}`, sem dados pessoais.
 */
export async function exportarRelatorio(
  ctx: ContextoUsuario,
  tipo: TipoRelatorio,
  q: RelatorioQuery,
  agora = new Date(),
): Promise<{ nomeArquivo: string; fluxo: Readable }> {
  const r = await gerarRelatorio(ctx.usuario, tipo, q, agora)
  const linhas = linhasDoCsv(r)
  const fuso = (await obterConfig())['sistema.fusoHorario']
  const nomeArquivo = `relatorio-${tipo}-${DateTime.fromJSDate(agora, { zone: fuso }).toFormat('yyyy-MM-dd')}.csv`

  async function* gerar(): AsyncGenerator<string> {
    let emitidas = 0
    try {
      yield BOM_CSV
      for (const l of linhas) {
        yield l
        emitidas += 1
      }
    } finally {
      await prisma.$transaction((tx) =>
        auditar(tx, ctx, {
          acao: 'exportacao.csv',
          entidade: 'relatorio',
          dados: { tipo, filtros: q, linhas: emitidas },
        }),
      )
    }
  }
  return { nomeArquivo, fluxo: Readable.from(gerar()) }
}
