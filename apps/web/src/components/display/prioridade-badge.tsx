import { ColorBadge } from './color-badge'

export interface PrioridadeBadgeProps {
  nome: string
  cor: string
}

export function PrioridadeBadge({ nome, cor }: PrioridadeBadgeProps) {
  return <ColorBadge cor={cor}>{nome}</ColorBadge>
}
