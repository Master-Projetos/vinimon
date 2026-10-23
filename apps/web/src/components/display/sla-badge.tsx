import { type DadosSla, type SituacaoSla, situacaoSla } from '@vinimon/shared'
import { CircleCheck, CirclePause, Clock, Hourglass, TriangleAlert } from 'lucide-react'
import { useAgora } from '@/hooks/use-agora'
import { ROTULOS_SITUACAO_SLA } from '@/lib/rotulos'

export interface SlaBadgeProps {
  sla: DadosSla
  /** Instante de referência; sem ele, usa o relógio atualizado a cada minuto. */
  agora?: Date
}

// Ícone e tom por situação: o texto é o que identifica o estado; a cor só reforça.
const APARENCIA: Record<SituacaoSla, { icone: typeof Clock | null; classe: string; rotulo: string }> = {
  SEM_SLA: { icone: null, classe: 'text-muted-foreground', rotulo: ROTULOS_SITUACAO_SLA.SEM_SLA },
  NO_PRAZO: { icone: Clock, classe: 'text-emerald-700 dark:text-emerald-300', rotulo: ROTULOS_SITUACAO_SLA.NO_PRAZO },
  EM_RISCO: { icone: Hourglass, classe: 'text-amber-700 dark:text-amber-300', rotulo: ROTULOS_SITUACAO_SLA.EM_RISCO },
  ESTOURADO: { icone: TriangleAlert, classe: 'text-red-700 dark:text-red-300', rotulo: 'Vencido' },
  PAUSADO: { icone: CirclePause, classe: 'text-sky-700 dark:text-sky-300', rotulo: ROTULOS_SITUACAO_SLA.PAUSADO },
  CUMPRIDO: {
    icone: CircleCheck,
    classe: 'text-emerald-700 dark:text-emerald-300',
    rotulo: ROTULOS_SITUACAO_SLA.CUMPRIDO,
  },
  VIOLADO: { icone: TriangleAlert, classe: 'text-red-700 dark:text-red-300', rotulo: ROTULOS_SITUACAO_SLA.VIOLADO },
}

export function SlaBadge({ sla, agora }: SlaBadgeProps) {
  const relogio = useAgora(60_000)
  const situacao = situacaoSla(sla, agora ?? relogio)
  const { icone: Icone, classe, rotulo } = APARENCIA[situacao]
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${classe}`} data-situacao={situacao}>
      {Icone ? <Icone aria-hidden="true" className="size-3.5" /> : null}
      {rotulo}
    </span>
  )
}
