// Situação do SLA para a UI (sem luxon)
export const SITUACOES_SLA = ['SEM_SLA', 'NO_PRAZO', 'EM_RISCO', 'ESTOURADO', 'PAUSADO', 'CUMPRIDO', 'VIOLADO'] as const
export type SituacaoSla = (typeof SITUACOES_SLA)[number]
export interface DadosSla {
  meta: number | null
  prazo: Date | null
  alerta: Date | null
  cumprido: boolean | null
  finalizado: boolean
  cancelado: boolean
}

export function situacaoSla(d: DadosSla, agora: Date): SituacaoSla {
  if (d.meta === null || d.cancelado) return 'SEM_SLA'
  if (d.finalizado) return d.cumprido === false ? 'VIOLADO' : 'CUMPRIDO'
  if (d.prazo === null) return 'PAUSADO'
  if (agora.getTime() > d.prazo.getTime()) return 'ESTOURADO'
  if (d.alerta !== null && agora.getTime() >= d.alerta.getTime()) return 'EM_RISCO'
  return 'NO_PRAZO'
}
// resposta: finalizado = primeiraRespostaEm !== null; solução: finalizado = concluidoEm !== null
