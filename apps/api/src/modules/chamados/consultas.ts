import {
  type ChamadoContagens,
  type ChamadoFiltros,
  type ChamadoResumo,
  idChamadoExato,
  normalizarBusca,
  temPermissao,
  tokensBusca,
  VISOES_CHAMADO,
  type VisaoChamado,
} from '@vinimon/shared'
import { DateTime } from 'luxon'
import { escopoChamados, podeVerInterno } from '../../autorizacao/chamados'
import type { Prisma } from '../../generated/prisma/client'
import { obterConfig } from '../../lib/config'
import { semPermissao } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'

const DEZ_MINUTOS_MS = 10 * 60 * 1000
const NOVENTA_DIAS_MS = 90 * 24 * 60 * 60 * 1000

const selectResumo = {
  id: true,
  assunto: true,
  solicitanteId: true,
  operadorId: true,
  areaId: true,
  statusTipo: true,
  cancelado: true,
  abertoEm: true,
  agendadoPara: true,
  primeiraRespostaEm: true,
  concluidoEm: true,
  slaRespostaMin: true,
  slaSolucaoMin: true,
  prazoRespostaEm: true,
  alertaRespostaEm: true,
  prazoSolucaoEm: true,
  alertaSolucaoEm: true,
  slaRespostaCumprido: true,
  slaSolucaoCumprido: true,
  ultimoAssentamentoId: true,
  ultimoAssentamentoPublicoId: true,
  ultimaInteracaoEm: true,
  ultimaInteracaoAutorId: true,
  ultimaAtividadeEm: true,
  status: { select: { id: true, nome: true, tipo: true, papel: true, cor: true } },
  prioridade: { select: { id: true, nome: true, cor: true, ordem: true } },
  area: { select: { id: true, nome: true } },
  problema: { select: { id: true, nome: true } },
  solicitante: { select: { id: true, nome: true } },
  operador: { select: { id: true, nome: true } },
} satisfies Prisma.ChamadoSelect

/** Visões do servidor (§3.6), sempre dentro do escopo: `filtroVisao` só estreita, nunca amplia. */
function filtroVisao(u: UsuarioSessao, visao: VisaoChamado | undefined): Prisma.ChamadoWhereInput {
  // ADMIN não tem área própria: nas visões por área vê todas
  const minhasAreas: Prisma.ChamadoWhereInput = temPermissao(u.perfil, 'chamado.verTodos')
    ? {}
    : { areaId: { in: u.areaIds } }
  switch (visao) {
    case 'fila-aberta':
      return { AND: [{ statusTipo: 'ABERTO' }, minhasAreas] }
    case 'minha-fila':
      return { operadorId: u.id, statusTipo: { in: ['EM_ATENDIMENTO', 'PENDENTE'] } }
    case 'agendados':
      return { statusTipo: 'AGENDADO', operadorId: u.id }
    case 'minha-area':
      return { AND: [{ statusTipo: { not: 'ENCERRADO' } }, minhasAreas] }
    case 'abertos-por-mim':
      return { solicitanteId: u.id }
    case 'aguardando-validacao':
      return { solicitanteId: u.id, statusTipo: 'CONCLUIDO' }
    case 'encerrados':
      return { statusTipo: 'ENCERRADO' }
    default:
      return {}
  }
}

/** Dia de calendário `AAAA-MM-DD` no fuso do sistema → instante de início ou de fim do dia. */
function limiteDoDia(dia: string, fuso: string, fim: boolean): Date {
  const d = DateTime.fromISO(dia, { zone: fuso })
  return (fim ? d.endOf('day') : d.startOf('day')).toJSDate()
}

/** Filtro de SLA de solução, com as mesmas regras de `situacaoSla` (sem cancelado, sem concluído, com prazo). */
function filtroSla(sla: NonNullable<ChamadoFiltros['sla']>, agora: Date): Prisma.ChamadoWhereInput {
  const abertos: Prisma.ChamadoWhereInput = { concluidoEm: null, cancelado: false, prazoSolucaoEm: { not: null } }
  if (sla === 'ESTOURADO') return { AND: [abertos, { prazoSolucaoEm: { lt: agora } }] }
  if (sla === 'EM_RISCO')
    return { AND: [abertos, { prazoSolucaoEm: { gte: agora } }, { alertaSolucaoEm: { lte: agora } }] }
  return {
    AND: [
      abertos,
      { prazoSolucaoEm: { gte: agora } },
      { OR: [{ alertaSolucaoEm: null }, { alertaSolucaoEm: { gt: agora } }] },
    ],
  }
}

/** Filtros da querystring. Nenhum deles amplia o escopo: entram em `AND` ao lado dele (S45). */
function filtrosDa(u: UsuarioSessao, f: ChamadoFiltros, fuso: string, agora: Date): Prisma.ChamadoWhereInput[] {
  const filtros: Prisma.ChamadoWhereInput[] = []
  const idExato = f.busca ? idChamadoExato(f.busca) : null

  if (idExato !== null) filtros.push({ id: idExato })
  else if (f.busca) {
    for (const token of tokensBusca(f.busca)) filtros.push({ buscaNorm: { contains: escaparLike(token) } })
    if (tokensBusca(f.busca).length === 0)
      filtros.push({ buscaNorm: { contains: escaparLike(normalizarBusca(f.busca)) } })
  }
  // status `ignorado` (C02) some da lista, salvo filtro explícito por status ou busca pelo número
  if (f.statusIds === undefined && idExato === null) filtros.push({ status: { ignorado: false } })

  if (f.statusIds?.length) filtros.push({ statusId: { in: f.statusIds } })
  if (f.prioridadeIds?.length) filtros.push({ prioridadeId: { in: f.prioridadeIds } })
  if (f.areaIds?.length) filtros.push({ areaId: { in: f.areaIds } })
  if (f.problemaIds?.length) filtros.push({ problemaId: { in: f.problemaIds } })
  if (f.canalIds?.length) filtros.push({ canalId: { in: f.canalIds } })
  if (f.departamentoIds?.length) filtros.push({ departamentoId: { in: f.departamentoIds } })
  if (f.operadorIds?.length) {
    const ids = f.operadorIds.filter((id) => id > 0)
    filtros.push({
      OR: [
        ...(ids.length ? [{ operadorId: { in: ids } }] : []),
        ...(f.operadorIds.includes(0) ? [{ operadorId: null }] : []),
      ],
    })
  }
  if (f.solicitanteId !== undefined) filtros.push({ solicitanteId: f.solicitanteId })

  if (f.tagIds?.length) {
    // tags são internas: quem não atende não filtra por elas (S49); "contém todas"
    if (!temPermissao(u.perfil, 'chamado.atender')) throw semPermissao()
    for (const tagId of f.tagIds) filtros.push({ tags: { some: { tagId } } })
  }
  if (f.sla) filtros.push(filtroSla(f.sla, agora))
  if (f.avaliacao?.length) filtros.push({ avaliacao: { is: { nota: { in: f.avaliacao } } } })
  if (f.teveRejeicao !== undefined) filtros.push(f.teveRejeicao ? { rejeicoes: { gt: 0 } } : { rejeicoes: 0 })

  // sem `visao` e sem `de`, só os últimos 90 dias
  if (f.de) filtros.push({ abertoEm: { gte: limiteDoDia(f.de, fuso, false) } })
  else if (!f.visao) filtros.push({ abertoEm: { gte: new Date(agora.getTime() - NOVENTA_DIAS_MS) } })
  if (f.ate) filtros.push({ abertoEm: { lte: limiteDoDia(f.ate, fuso, true) } })
  if (f.concluidoDe) filtros.push({ concluidoEm: { gte: limiteDoDia(f.concluidoDe, fuso, false) } })
  if (f.concluidoAte) filtros.push({ concluidoEm: { lte: limiteDoDia(f.concluidoAte, fuso, true) } })
  return filtros
}

function ordenacao(f: ChamadoFiltros): Prisma.ChamadoOrderByWithRelationInput[] {
  // fila aberta: prioridade maior primeiro (a `ordem` da prioridade cresce com a urgência), depois o mais antigo
  if (f.visao === 'fila-aberta') return [{ prioridade: { ordem: 'desc' } }, { abertoEm: 'asc' }, { id: 'asc' }]
  const d = f.direcao
  const por: Record<ChamadoFiltros['ordem'], Prisma.ChamadoOrderByWithRelationInput> = {
    id: { id: d },
    abertoEm: { abertoEm: d },
    prioridade: { prioridade: { ordem: d } },
    ultimaAtividade: { ultimaAtividadeEm: d },
    prazoSolucao: { prazoSolucaoEm: { sort: d, nulls: 'last' } },
  }
  return [por[f.ordem], { id: d }]
}

/** `where = { AND: [escopoChamados(u), filtroVisao, ...filtros] }`: o escopo nunca é espalhado junto dos filtros (S45). */
export async function listar(u: UsuarioSessao, f: ChamadoFiltros, agora = new Date()) {
  const cfg = await obterConfig()
  const where: Prisma.ChamadoWhereInput = {
    AND: [escopoChamados(u), filtroVisao(u, f.visao), ...filtrosDa(u, f, cfg['sistema.fusoHorario'], agora)],
  }
  const [linhas, total] = await prisma.$transaction([
    prisma.chamado.findMany({ where, select: selectResumo, orderBy: ordenacao(f), ...paginar(f) }),
    prisma.chamado.count({ where }),
  ])

  const ids = linhas.map((l) => l.id)
  const [leituras, anexos] = await Promise.all([
    prisma.chamadoLeitura.findMany({
      where: { usuarioId: u.id, chamadoId: { in: ids } },
      select: { chamadoId: true, ultimoAssentamentoLidoId: true },
    }),
    prisma.anexo.groupBy({ by: ['chamadoId', 'interno'], where: { chamadoId: { in: ids } }, _count: { _all: true } }),
  ])
  const lido = new Map(leituras.map((l) => [l.chamadoId, l.ultimoAssentamentoLidoId]))

  const itens: ChamadoResumo[] = linhas.map((c) => {
    const verInterno = podeVerInterno(u, { areaId: c.areaId, operadorId: c.operadorId, solicitanteId: c.solicitanteId })
    const ultimo = verInterno ? c.ultimoAssentamentoId : c.ultimoAssentamentoPublicoId
    const lidoAte = lido.get(c.id)
    const qtdAnexos = anexos
      .filter((a) => a.chamadoId === c.id && (verInterno || !a.interno))
      .reduce((soma, a) => soma + a._count._all, 0)
    return {
      id: c.id,
      assunto: c.assunto,
      novo: agora.getTime() - c.abertoEm.getTime() < DEZ_MINUTOS_MS,
      cancelado: c.cancelado,
      status: c.status,
      prioridade: c.prioridade,
      area: c.area,
      problema: c.problema,
      solicitante: c.solicitante,
      operador: c.operador,
      abertoEm: c.abertoEm,
      agendadoPara: c.agendadoPara,
      ultimaAtividadeEm: c.ultimaAtividadeEm,
      ultimaInteracao: c.ultimaInteracaoEm ? { em: c.ultimaInteracaoEm, autorId: c.ultimaInteracaoAutorId } : null,
      naoLido: ultimo !== null && (lidoAte === undefined || lidoAte < ultimo),
      qtdAnexos,
      sla: {
        resposta: {
          meta: c.slaRespostaMin,
          prazo: c.prazoRespostaEm,
          alerta: c.alertaRespostaEm,
          cumprido: c.slaRespostaCumprido,
          finalizado: c.primeiraRespostaEm !== null,
        },
        solucao: {
          meta: c.slaSolucaoMin,
          prazo: c.prazoSolucaoEm,
          alerta: c.alertaSolucaoEm,
          cumprido: c.slaSolucaoCumprido,
          finalizado: c.concluidoEm !== null,
        },
      },
    }
  })
  return { itens, total, pagina: f.pagina, porPagina: f.porPagina }
}

/** Um `count` por visão, numa transação só. O status ignorado (C02) não entra. */
export async function contagens(u: UsuarioSessao): Promise<ChamadoContagens> {
  const escopo = escopoChamados(u)
  const contar = (visao: VisaoChamado) =>
    prisma.chamado.count({ where: { AND: [escopo, filtroVisao(u, visao), { status: { ignorado: false } }] } })
  const totais = await prisma.$transaction(VISOES_CHAMADO.map((v) => contar(v)))
  return Object.fromEntries(VISOES_CHAMADO.map((v, i) => [v, totais[i] ?? 0])) as ChamadoContagens
}
