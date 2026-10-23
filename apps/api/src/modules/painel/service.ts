import { type Painel, type PainelQuery, temPermissao } from '@vinimon/shared'
import { DateTime } from 'luxon'
import { escopoChamados } from '../../autorizacao/chamados'
import type { Prisma } from '../../generated/prisma/client'
import { obterConfig } from '../../lib/config'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'

const EM_CURSO = ['ABERTO', 'EM_ATENDIMENTO', 'PENDENTE', 'AGENDADO'] as const
const MESES = 4
const DIA_MS = 24 * 60 * 60 * 1000

/** Mesmas regras de `situacaoSla` da lista: sem cancelado, sem concluído e com prazo. */
function slaAberto(): Prisma.ChamadoWhereInput {
  return { concluidoEm: null, cancelado: false, prazoSolucaoEm: { not: null } }
}

/** Nomes dos ids que vieram de um `groupBy` (no máximo uma linha por id agrupado). */
async function comNomes(
  grupos: Array<{ id: number | null; total: number }>,
  buscar: (ids: number[]) => Promise<Array<{ id: number; nome: string }>>,
): Promise<Array<{ id: number; nome: string; total: number }>> {
  const ids = grupos.flatMap((g) => (g.id === null ? [] : [g.id]))
  const nomes = new Map((await buscar(ids)).map((n) => [n.id, n.nome]))
  return grupos
    .filter((g): g is { id: number; total: number } => g.id !== null)
    .map((g) => ({ id: g.id, nome: nomes.get(g.id) ?? `#${g.id}`, total: g.total }))
    .sort((a, b) => b.total - a.total || a.id - b.id)
}

/**
 * `GET /painel`. Base `AND: [escopoChamados(u), naoIgnorado, filtroArea]` (S44, S45): toda consulta é `count`,
 * `groupBy` ou `findMany` com `take`. Os KPIs são o retrato de agora; o período limita só as distribuições.
 */
export async function obterPainel(u: UsuarioSessao, q: PainelQuery, agora = new Date()): Promise<Painel> {
  const fuso = (await obterConfig())['sistema.fusoHorario']
  const equipe = temPermissao(u.perfil, 'chamado.atender')
  const filtroArea: Prisma.ChamadoWhereInput =
    q.areaId === undefined ? {} : q.modoArea === 'origem' ? { solicitante: { areaId: q.areaId } } : { areaId: q.areaId }
  const base: Prisma.ChamadoWhereInput = { AND: [escopoChamados(u), { status: { ignorado: false } }, filtroArea] }
  const com = (...filtros: Prisma.ChamadoWhereInput[]): Prisma.ChamadoWhereInput => ({ AND: [base, ...filtros] })

  const hoje = DateTime.fromJSDate(agora, { zone: fuso }).startOf('day').toJSDate()
  const mesAtual = DateTime.fromJSDate(agora, { zone: fuso }).startOf('month')
  const meses = Array.from({ length: MESES }, (_, i) => mesAtual.minus({ months: MESES - 1 - i }))
  const noPeriodo = com(
    { abertoEm: { gte: new Date(agora.getTime() - q.periodo * DIA_MS) } },
    { statusTipo: { in: [...EM_CURSO] } },
  )

  const [
    abertos,
    filaSemResponsavel,
    minhaFila,
    abertosHoje,
    concluidosHoje,
    slaVencido,
    slaEmRisco,
    aguardandoValidacao,
    ...mesesContados
  ] = await prisma.$transaction([
    prisma.chamado.count({ where: com({ statusTipo: { in: [...EM_CURSO] } }) }),
    prisma.chamado.count({ where: com({ statusTipo: 'ABERTO', operadorId: null }) }),
    prisma.chamado.count({ where: com({ operadorId: u.id, statusTipo: { in: ['EM_ATENDIMENTO', 'PENDENTE'] } }) }),
    prisma.chamado.count({ where: com({ abertoEm: { gte: hoje } }) }),
    prisma.chamado.count({ where: com({ concluidoEm: { gte: hoje }, cancelado: false }) }),
    prisma.chamado.count({ where: com(slaAberto(), { prazoSolucaoEm: { lt: agora } }) }),
    prisma.chamado.count({
      where: com(slaAberto(), { prazoSolucaoEm: { gte: agora } }, { alertaSolucaoEm: { lte: agora } }),
    }),
    prisma.chamado.count({ where: com({ statusTipo: 'CONCLUIDO' }) }),
    ...meses.flatMap((inicio) => {
      const fim = inicio.plus({ months: 1 })
      return [
        prisma.chamado.count({ where: com({ abertoEm: { gte: inicio.toJSDate(), lt: fim.toJSDate() } }) }),
        prisma.chamado.count({ where: com({ encerradoEm: { gte: inicio.toJSDate(), lt: fim.toJSDate() } }) }),
      ]
    }),
  ])

  const [porStatus, porPrioridade, porArea, avaliacoes, proximos] = await Promise.all([
    prisma.chamado.groupBy({ by: ['statusId'], where: noPeriodo, _count: { _all: true } }),
    prisma.chamado.groupBy({ by: ['prioridadeId'], where: noPeriodo, _count: { _all: true } }),
    prisma.chamado.groupBy({ by: ['areaId'], where: noPeriodo, _count: { _all: true } }),
    prisma.avaliacaoChamado.groupBy({
      by: ['nota'],
      where: { criadoEm: { gte: mesAtual.toJSDate() }, chamado: base },
      _count: { _all: true },
    }),
    prisma.chamado.findMany({
      where: com(slaAberto(), { slaPausado: false }),
      select: {
        id: true,
        assunto: true,
        prazoSolucaoEm: true,
        status: { select: { nome: true } },
        area: { select: { nome: true } },
      },
      orderBy: [{ prazoSolucaoEm: 'asc' }, { id: 'asc' }],
      take: 5,
    }),
  ])

  const [statusNomes, prioridadeNomes, areaNomes] = await Promise.all([
    comNomes(
      porStatus.map((g) => ({ id: g.statusId, total: g._count._all })),
      (ids) => prisma.status.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }),
    ),
    comNomes(
      porPrioridade.map((g) => ({ id: g.prioridadeId, total: g._count._all })),
      (ids) => prisma.prioridade.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }),
    ),
    comNomes(
      porArea.map((g) => ({ id: g.areaId, total: g._count._all })),
      (ids) => prisma.area.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }),
    ),
  ])

  return {
    reduzido: !equipe,
    periodo: q.periodo,
    kpis: {
      abertos,
      filaSemResponsavel: equipe ? filaSemResponsavel : 0,
      minhaFila: equipe ? minhaFila : 0,
      abertosHoje,
      concluidosHoje,
      slaVencido,
      slaEmRisco,
      aguardandoValidacao,
    },
    abertosEncerradosPorMes: meses.map((m, i) => ({
      mes: m.toFormat('yyyy-MM'),
      abertos: mesesContados[i * 2] ?? 0,
      encerrados: mesesContados[i * 2 + 1] ?? 0,
    })),
    porStatus: statusNomes,
    porPrioridade: prioridadeNomes,
    porArea: equipe ? areaNomes : [],
    avaliacoesDoMes: avaliacoes.map((a) => ({ nota: a.nota, total: a._count._all })),
    slaProximo: proximos.flatMap((c) =>
      c.prazoSolucaoEm === null
        ? []
        : [
            {
              id: c.id,
              assunto: c.assunto,
              status: c.status.nome,
              area: c.area.nome,
              prazoSolucaoEm: c.prazoSolucaoEm,
            },
          ],
    ),
  }
}
