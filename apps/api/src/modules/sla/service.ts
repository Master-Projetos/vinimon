import type { Prisma } from '../../generated/prisma/client'
import { obterConfig } from '../../lib/config'
import { conflito, naoEncontrado, regraNegocio } from '../../lib/erros'
import type { Tx } from '../../lib/prisma'
import type { CalendarioSla } from './calendario'
import { type IntervaloPausa, recalcularSla } from './recalculo'

const TTL_CALENDARIO_MS = 60_000
const calendarios = new Map<number, { cal: CalendarioSla; ate: number }>()

/** Chamar depois de editar jornada, horário ou feriado (sem argumento, limpa tudo). */
export function invalidarCalendario(jornadaId?: number): void {
  if (jornadaId === undefined) calendarios.clear()
  else calendarios.delete(jornadaId)
}

/** Calendário da jornada, com cache de 60 s. Feriado sem `jornadaId` vale para todas as jornadas. */
export async function carregarCalendario(tx: Tx, jornadaId: number): Promise<CalendarioSla> {
  const memo = calendarios.get(jornadaId)
  if (memo && memo.ate > Date.now()) return memo.cal
  const jornada = await tx.jornada.findUnique({
    where: { id: jornadaId },
    select: {
      timezone: true,
      ininterrupta: true,
      horarios: { select: { diaSemana: true, inicioMin: true, fimMin: true } },
    },
  })
  if (!jornada) throw naoEncontrado('Jornada não encontrada.')
  const feriadosDb = await tx.feriado.findMany({
    where: { OR: [{ jornadaId: null }, { jornadaId }] },
    select: { data: true, recorrente: true },
  })
  const feriados = new Set<string>()
  const feriadosRecorrentes = new Set<string>()
  for (const f of feriadosDb) {
    const iso = f.data.toISOString() // @db.Date: nunca usar getters locais
    if (f.recorrente) feriadosRecorrentes.add(iso.slice(5, 10))
    else feriados.add(iso.slice(0, 10))
  }
  const cal: CalendarioSla = {
    timezone: jornada.timezone,
    ininterrupta: jornada.ininterrupta,
    horarios: jornada.horarios,
    feriados,
    feriadosRecorrentes,
  }
  calendarios.set(jornadaId, { cal, ate: Date.now() + TTL_CALENDARIO_MS })
  return cal
}

/**
 * Metas e jornada copiadas para o chamado (abertura e troca de problema, prioridade ou área).
 * Cada meta vem do problema; se ele não define, da prioridade; se nenhum define, fica null (sem SLA).
 * Jornada: a da área; senão `sla.jornadaPadraoId`; senão a primeira jornada ininterrupta ativa.
 */
export async function snapshotSla(
  tx: Tx,
  dados: { problemaId: number | null; prioridadeId: number; areaId: number },
): Promise<{ jornadaId: number; slaRespostaMin: number | null; slaSolucaoMin: number | null }> {
  const problema =
    dados.problemaId === null
      ? null
      : await tx.problema.findUnique({
          where: { id: dados.problemaId },
          select: { slaRespostaMin: true, slaSolucaoMin: true },
        })
  const prioridade = await tx.prioridade.findUnique({
    where: { id: dados.prioridadeId },
    select: { slaRespostaMin: true, slaSolucaoMin: true },
  })
  if (!prioridade) throw regraNegocio('Prioridade inválida.')
  const area = await tx.area.findUnique({ where: { id: dados.areaId }, select: { jornadaId: true } })
  if (!area) throw regraNegocio('Área inválida.')

  let jornadaId = area.jornadaId ?? (await obterConfig())['sla.jornadaPadraoId']
  if (jornadaId === null) {
    const padrao = await tx.jornada.findFirst({
      where: { ininterrupta: true, ativo: true },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
    if (!padrao) throw regraNegocio('Nenhuma jornada de SLA disponível. Configure uma jornada padrão.')
    jornadaId = padrao.id
  }
  return {
    jornadaId,
    slaRespostaMin: problema?.slaRespostaMin ?? prioridade.slaRespostaMin,
    slaSolucaoMin: problema?.slaSolucaoMin ?? prioridade.slaSolucaoMin,
  }
}

const mudou = (a: Date | null, b: Date | null): boolean => (a?.getTime() ?? null) !== (b?.getTime() ?? null)

/**
 * Recalcula prazos, alertas, pausas e tempos do chamado (dentro da transação do chamador). Pausas = estágios com
 * `pausaSla` mais o estágio atual se `slaPausado`. Se algum prazo ou alerta mudar, os avisos `slaAviso*` são zerados.
 * Não mexe em `versao`: quem muda o chamado já controla a versão.
 */
export async function recalcularChamado(tx: Tx, chamadoId: number, _agora: Date): Promise<void> {
  const c = await tx.chamado.findUnique({
    where: { id: chamadoId },
    select: {
      abertoEm: true,
      jornadaId: true,
      slaRespostaMin: true,
      slaSolucaoMin: true,
      primeiraRespostaEm: true,
      concluidoEm: true,
      statusDesde: true,
      slaPausado: true,
      prazoRespostaEm: true,
      alertaRespostaEm: true,
      prazoSolucaoEm: true,
      alertaSolucaoEm: true,
    },
  })
  if (!c) throw naoEncontrado('Chamado não encontrado.')
  const estagios = await tx.chamadoEstagio.findMany({
    where: { chamadoId, pausaSla: true },
    orderBy: { inicioEm: 'asc' },
    select: { inicioEm: true, fimEm: true },
  })
  const pausas: IntervaloPausa[] = estagios.map((e) => ({ inicio: e.inicioEm, fim: e.fimEm }))
  if (c.slaPausado) pausas.push({ inicio: c.statusDesde, fim: null })

  const cal = await carregarCalendario(tx, c.jornadaId)
  const alertaPct = (await obterConfig())['sla.alertaPct']
  const r = recalcularSla(
    {
      abertoEm: c.abertoEm,
      slaRespostaMin: c.slaRespostaMin,
      slaSolucaoMin: c.slaSolucaoMin,
      primeiraRespostaEm: c.primeiraRespostaEm,
      concluidoEm: c.concluidoEm,
      pausas,
      alertaPct,
    },
    cal,
  )
  const prazosMudaram =
    mudou(c.prazoRespostaEm, r.prazoRespostaEm) ||
    mudou(c.alertaRespostaEm, r.alertaRespostaEm) ||
    mudou(c.prazoSolucaoEm, r.prazoSolucaoEm) ||
    mudou(c.alertaSolucaoEm, r.alertaSolucaoEm)
  await tx.chamado.update({
    where: { id: chamadoId },
    data: {
      ...r,
      ...(prazosMudaram ? { slaAvisoRiscoEm: null, slaAvisoEstouroEm: null, slaAvisoRespostaEm: null } : {}),
    },
  })
}

/**
 * Transição de status com lock otimista (§4.6): fecha o estágio atual, ajusta as datas conforme o tipo novo,
 * atualiza com `versao + 1` e recalcula o SLA. O evento é registrado por quem chama.
 * `extras` entra por último, mas nunca troca a `versao`.
 */
export async function aplicarTransicaoStatus(
  tx: Tx,
  p: {
    chamadoId: number
    versao: number
    novoStatusId: number
    atorId: number | null
    agora: Date
    extras?: Prisma.ChamadoUncheckedUpdateManyInput
  },
): Promise<{ statusAnteriorId: number }> {
  const chamado = await tx.chamado.findUnique({
    where: { id: p.chamadoId },
    select: {
      statusId: true,
      statusTipo: true,
      statusDesde: true,
      slaPausado: true,
      operadorId: true,
      concluidoEm: true,
      encerradoEm: true,
      versao: true,
    },
  })
  if (!chamado) throw naoEncontrado('Chamado não encontrado.')
  const novo = await tx.status.findFirst({
    where: { id: p.novoStatusId, ativo: true },
    select: { id: true, tipo: true, pausaSla: true },
  })
  if (!novo) throw regraNegocio('Status inexistente ou inativo.')
  const mensagemConflito = 'O chamado foi alterado por outra pessoa. Recarregue.'
  if (chamado.versao !== p.versao) throw conflito(mensagemConflito) // evita deixar estágio órfão; o updateMany abaixo é a guarda atômica

  await tx.chamadoEstagio.create({
    data: {
      chamadoId: p.chamadoId,
      statusId: chamado.statusId,
      statusTipo: chamado.statusTipo,
      pausaSla: chamado.slaPausado,
      inicioEm: chamado.statusDesde,
      fimEm: p.agora,
      operadorId: chamado.operadorId,
      autorId: p.atorId,
    },
  })

  const data: Prisma.ChamadoUncheckedUpdateManyInput = {
    statusId: novo.id,
    statusTipo: novo.tipo,
    statusDesde: p.agora,
    slaPausado: novo.pausaSla,
  }
  if (novo.tipo === 'CONCLUIDO') data.concluidoEm = chamado.concluidoEm ?? p.agora
  else if (novo.tipo === 'ENCERRADO') {
    data.concluidoEm = chamado.concluidoEm ?? p.agora
    data.encerradoEm = chamado.encerradoEm ?? p.agora
  } else {
    data.concluidoEm = null
    data.encerradoEm = null
    data.validacaoLimiteEm = null
  }
  if (novo.tipo !== 'AGENDADO') data.agendadoPara = null
  if (novo.tipo === 'ABERTO') data.operadorId = null

  const { count } = await tx.chamado.updateMany({
    where: { id: p.chamadoId, versao: p.versao },
    data: { ...data, ...p.extras, versao: { increment: 1 } },
  })
  if (count === 0) throw conflito(mensagemConflito)

  await recalcularChamado(tx, p.chamadoId, p.agora)
  return { statusAnteriorId: chamado.statusId }
}
