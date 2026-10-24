import { FILTROS_NOTIFICACAO, type FiltroNotificacao } from '@vinimon/shared'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const ROTULOS: Record<FiltroNotificacao, string> = {
  todas: 'Todas',
  nao_lidas: 'Não lidas',
  mencoes: 'Menções',
  atribuicoes: 'Atribuições',
  sla: 'SLA',
}

export interface ActivityFiltersProps {
  valor: FiltroNotificacao
  aoMudar: (filtro: FiltroNotificacao) => void
}

export function ActivityFilters({ valor, aoMudar }: ActivityFiltersProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={valor}
      aria-label="Filtrar atividade"
      className="flex-wrap"
      onValueChange={(v) => {
        const novo = FILTROS_NOTIFICACAO.find((f) => f === v)
        if (novo) aoMudar(novo)
      }}
    >
      {FILTROS_NOTIFICACAO.map((f) => (
        <ToggleGroupItem key={f} value={f} aria-label={ROTULOS[f]}>
          {ROTULOS[f]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
