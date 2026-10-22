import {
  adicionarMinutosUteis,
  adicionarMsUteis,
  type CalendarioSla,
  minutosUteisEntre,
  msUteisEntre,
} from './calendario'

export interface IntervaloPausa {
  inicio: Date
  fim: Date | null // fim null = pausa em curso
}
export interface EntradaSla {
  abertoEm: Date
  slaRespostaMin: number | null
  slaSolucaoMin: number | null
  primeiraRespostaEm: Date | null
  concluidoEm: Date | null
  pausas: readonly IntervaloPausa[]
  alertaPct: number // config sla.alertaPct
}
export interface ResultadoSla {
  prazoRespostaEm: Date | null
  alertaRespostaEm: Date | null
  prazoSolucaoEm: Date | null
  alertaSolucaoEm: Date | null
  slaPausadoSeg: number
  slaRespostaCumprido: boolean | null
  slaSolucaoCumprido: boolean | null
  tempoRespostaUtilMin: number | null
  tempoSolucaoUtilMin: number | null
}

export function recalcularSla(e: EntradaSla, cal: CalendarioSla): ResultadoSla {
  const fracao = e.alertaPct / 100
  const abertura = e.abertoEm.getTime()
  const prazoRespostaEm = e.slaRespostaMin ? adicionarMinutosUteis(e.abertoEm, e.slaRespostaMin, cal) : null
  const alertaRespostaEm = e.slaRespostaMin ? adicionarMinutosUteis(e.abertoEm, e.slaRespostaMin * fracao, cal) : null
  const slaRespostaCumprido =
    prazoRespostaEm && e.primeiraRespostaEm ? e.primeiraRespostaEm.getTime() <= prazoRespostaEm.getTime() : null
  const tempoRespostaUtilMin = e.primeiraRespostaEm ? minutosUteisEntre(e.abertoEm, e.primeiraRespostaEm, cal) : null

  const teto = e.concluidoEm?.getTime() ?? Number.POSITIVE_INFINITY
  let pausadoMs = 0
  let pausaAtual: IntervaloPausa | null = null
  for (const p of e.pausas) {
    if (p.fim === null) {
      pausaAtual = p
      continue
    }
    const ini = Math.max(p.inicio.getTime(), abertura)
    const fim = Math.min(p.fim.getTime(), teto)
    if (fim > ini) pausadoMs += msUteisEntre(new Date(ini), new Date(fim), cal)
  }
  const slaPausadoSeg = Math.floor(pausadoMs / 1000)
  const tempoSolucaoUtilMin = e.concluidoEm
    ? Math.max(0, Math.floor((msUteisEntre(e.abertoEm, e.concluidoEm, cal) - pausadoMs) / 60_000))
    : null
  const base = {
    prazoRespostaEm,
    alertaRespostaEm,
    slaRespostaCumprido,
    tempoRespostaUtilMin,
    slaPausadoSeg,
    tempoSolucaoUtilMin,
  }

  if (!e.slaSolucaoMin) return { ...base, prazoSolucaoEm: null, alertaSolucaoEm: null, slaSolucaoCumprido: null }
  const metaMs = e.slaSolucaoMin * 60_000
  const prazoSolucaoEm = adicionarMsUteis(e.abertoEm, metaMs + pausadoMs, cal)
  const alertaSolucaoEm = adicionarMsUteis(e.abertoEm, Math.round(metaMs * fracao) + pausadoMs, cal)
  if (e.concluidoEm) {
    return {
      ...base,
      prazoSolucaoEm,
      alertaSolucaoEm,
      slaSolucaoCumprido: e.concluidoEm.getTime() <= prazoSolucaoEm.getTime(),
    }
  }
  if (pausaAtual && pausaAtual.inicio.getTime() <= prazoSolucaoEm.getTime()) {
    return { ...base, prazoSolucaoEm: null, alertaSolucaoEm: null, slaSolucaoCumprido: null } // relógio parado
  }
  return { ...base, prazoSolucaoEm, alertaSolucaoEm, slaSolucaoCumprido: null }
}
