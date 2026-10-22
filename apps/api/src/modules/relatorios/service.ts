import type { LinhaRelatorio, Relatorio, RelatorioQuery, TipoRelatorio } from '@vinimon/shared'
import { DateTime } from 'luxon'
import { escopoChamados } from '../../autorizacao/chamados'
import type { Prisma } from '../../generated/prisma/client'
import { obterConfig } from '../../lib/config'
import { naoEncontrado } from '../../lib/erros'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'

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

/** `GET /relatorios/:tipo` (partes 1: visão geral e as cinco dimensões; `sla` e `avaliacoes` entram na T-8.3). */
export async function gerarRelatorio(
  u: UsuarioSessao,
  tipo: TipoRelatorio,
  q: RelatorioQuery,
  agora = new Date(),
): Promise<Relatorio> {
  if (tipo === 'sla' || tipo === 'avaliacoes') throw naoEncontrado('Relatório não disponível.')
  const p = await periodoDe(q, agora)
  const where = whereDoRelatorio(u, q, p.inicio, p.fim)
  const totais = await totaisDe(where)
  const linhas: LinhaRelatorio[] =
    tipo === 'visao-geral' ? [{ chave: 'geral', nome: 'Visão geral', ...totais }] : await porDimensao(tipo, where)
  return { tipo, de: p.de, ate: p.ate, totais, linhas }
}
