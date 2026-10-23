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

async function totaisDe(where: Prisma.ChamadoWhereInput) {
  const [total, encerrados, cumpridos, estourados, media] = await prisma.$transaction([
    prisma.chamado.count({ where }),
    prisma.chamado.count({ where: { AND: [where, { statusTipo: 'ENCERRADO' }] } }),
    prisma.chamado.count({ where: { AND: [where, { slaSolucaoCumprido: true }] } }),
    prisma.chamado.count({ where: { AND: [where, { slaSolucaoCumprido: false }] } }),
    prisma.chamado.aggregate({ where, _avg: { tempoSolucaoUtilMin: true } }),
  ])
  return indicadores(total, encerrados, cumpridos, estourados, media._avg.tempoSolucaoUtilMin)
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

async function porDimensao(dim: Dimensao, where: Prisma.ChamadoWhereInput): Promise<LinhaRelatorio[]> {
  const campo = CAMPO[dim]
  const [geral, encerrados, prazo] = await Promise.all([
    prisma.chamado.groupBy({
      by: [campo],
      where,
      _count: { _all: true },
      _avg: { tempoSolucaoUtilMin: true },
      orderBy: { _count: { id: 'desc' } },
      take: LIMITE_LINHAS,
    }),
    prisma.chamado.groupBy({
      by: [campo],
      where: { AND: [where, { statusTipo: 'ENCERRADO' }] },
      _count: { _all: true },
    }),
    prisma.chamado.groupBy({
      by: [campo, 'slaSolucaoCumprido'],
      where: { AND: [where, { slaSolucaoCumprido: { not: null } }] },
      _count: { _all: true },
    }),
  ])
  const chaveDe = (v: number | null) => (v === null ? 'sem' : String(v))
  const nEnc = new Map(encerrados.map((g) => [chaveDe(g[campo]), g._count._all]))
  const nPrazo = new Map<string, { sim: number; nao: number }>()
  for (const g of prazo) {
    const k = chaveDe(g[campo])
    const atual = nPrazo.get(k) ?? { sim: 0, nao: 0 }
    if (g.slaSolucaoCumprido) atual.sim += g._count._all
    else atual.nao += g._count._all
    nPrazo.set(k, atual)
  }
  const ids = geral.flatMap((g) => (g[campo] === null ? [] : [g[campo] as number]))
  const nomes = await nomesDe(dim, ids)
  return geral.map((g) => {
    const k = chaveDe(g[campo])
    const p = nPrazo.get(k) ?? { sim: 0, nao: 0 }
    const id = g[campo]
    return {
      chave: k,
      nome: id === null ? SEM[dim] : (nomes.get(id) ?? `#${id}`),
      ...indicadores(g._count._all, nEnc.get(k) ?? 0, p.sim, p.nao, g._avg.tempoSolucaoUtilMin),
    }
  })
}

const pct = (parte: number, base: number) => (base === 0 ? null : arredondar((parte / base) * 100))

/** Percentuais de SLA agrupados por `campo`; o denominador de cada meta é só quem tem o valor não nulo. */
async function slaPor(campo: 'areaId' | 'problemaId', where: Prisma.ChamadoWhereInput): Promise<LinhaSla[]> {
  const [geral, resposta, solucao] = await Promise.all([
    prisma.chamado.groupBy({
      by: [campo],
      where,
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
      take: LIMITE_LINHAS,
    }),
    prisma.chamado.groupBy({
      by: [campo, 'slaRespostaCumprido'],
      where: { AND: [where, { slaRespostaCumprido: { not: null } }] },
      _count: { _all: true },
    }),
    prisma.chamado.groupBy({
      by: [campo, 'slaSolucaoCumprido'],
      where: { AND: [where, { slaSolucaoCumprido: { not: null } }] },
      _count: { _all: true },
    }),
  ])
  const chaveDe = (v: number | null) => (v === null ? 'sem' : String(v))
  const somar = (grupos: { id: number | null; cumprido: boolean | null; n: number }[]) => {
    const m = new Map<string, { sim: number; nao: number }>()
    for (const g of grupos) {
      const k = chaveDe(g.id)
      const atual = m.get(k) ?? { sim: 0, nao: 0 }
      if (g.cumprido) atual.sim += g.n
      else atual.nao += g.n
      m.set(k, atual)
    }
    return m
  }
  const mResposta = somar(resposta.map((g) => ({ id: g[campo], cumprido: g.slaRespostaCumprido, n: g._count._all })))
  const mSolucao = somar(solucao.map((g) => ({ id: g[campo], cumprido: g.slaSolucaoCumprido, n: g._count._all })))
  const ids = geral.flatMap((g) => (g[campo] === null ? [] : [g[campo] as number]))
  const dim: Dimensao = campo === 'areaId' ? 'por-area' : 'por-problema'
  const nomes = await nomesDe(dim, ids)
  return geral.map((g) => {
    const id = g[campo]
    const k = chaveDe(id)
    const r = mResposta.get(k) ?? { sim: 0, nao: 0 }
    const so = mSolucao.get(k) ?? { sim: 0, nao: 0 }
    return {
      chave: k,
      nome: id === null ? SEM[dim] : (nomes.get(id) ?? `#${id}`),
      total: g._count._all,
      comMetaResposta: r.sim + r.nao,
      pctRespostaNoPrazo: pct(r.sim, r.sim + r.nao),
      comMetaSolucao: so.sim + so.nao,
      pctSolucaoNoPrazo: pct(so.sim, so.sim + so.nao),
    }
  })
}

async function detalheSla(where: Prisma.ChamadoWhereInput): Promise<DetalheSla> {
  const [porArea, porProblema] = await Promise.all([slaPor('areaId', where), slaPor('problemaId', where)])
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
  const totais = await totaisDe(where)
  const base = { tipo, de: p.de, ate: p.ate, totais }
  switch (tipo) {
    case 'visao-geral':
      return { ...base, linhas: [{ chave: 'geral', nome: 'Visão geral', ...totais }] }
    case 'sla':
      return { ...base, linhas: await porDimensao('por-area', where), sla: await detalheSla(where) }
    case 'avaliacoes':
      return { ...base, linhas: await porDimensao('por-operador', where), avaliacoes: await detalheAvaliacoes(where) }
    default:
      return { ...base, linhas: await porDimensao(tipo, where) }
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
