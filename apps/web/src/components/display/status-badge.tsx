import { ColorBadge } from './color-badge'

export interface StatusBadgeProps {
  nome: string
  cor: string
}

export function StatusBadge({ nome, cor }: StatusBadgeProps) {
  return <ColorBadge cor={cor}>{nome}</ColorBadge>
}
