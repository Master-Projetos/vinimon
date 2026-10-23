import { ROTULOS_PRESENCA } from '@/lib/rotulos'

export type StatusPresenca = 'DISPONIVEL' | 'OCUPADO' | 'AUSENTE' | 'OFFLINE'

// Glifo diferente por estado: a cor não é o único indicador (§6.2).
const GLIFO: Record<StatusPresenca, string> = {
  DISPONIVEL: '●',
  OCUPADO: '⊖',
  AUSENTE: '◐',
  OFFLINE: '○',
}

const ROTULO: Record<StatusPresenca, string> = {
  DISPONIVEL: 'Disponível',
  ...ROTULOS_PRESENCA,
  OFFLINE: 'Offline',
}

const COR: Record<StatusPresenca, string> = {
  DISPONIVEL: 'text-emerald-600 dark:text-emerald-400',
  OCUPADO: 'text-red-600 dark:text-red-400',
  AUSENTE: 'text-amber-600 dark:text-amber-400',
  OFFLINE: 'text-muted-foreground',
}

export interface PresenceIndicatorProps {
  status: StatusPresenca
}

export function PresenceIndicator({ status }: PresenceIndicatorProps) {
  return (
    <span className={`inline-flex items-center ${COR[status]}`}>
      <span aria-hidden="true">{GLIFO[status]}</span>
      <span className="sr-only">{ROTULO[status]}</span>
    </span>
  )
}
