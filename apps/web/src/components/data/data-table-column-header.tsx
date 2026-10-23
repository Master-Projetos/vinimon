import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface DataTableColumnHeaderProps {
  titulo: string
  campo: string
  ordenacao?: { campo: string; direcao: 'asc' | 'desc' }
  aoOrdenar?: (o: { campo: string; direcao: 'asc' | 'desc' }) => void
}

/** Cabeçalho ordenável. O `aria-sort` fica no `<th>` (DataTable), que é quem tem o papel de cabeçalho de coluna. */
export function DataTableColumnHeader({ titulo, campo, ordenacao, aoOrdenar }: DataTableColumnHeaderProps) {
  if (!aoOrdenar) return <span>{titulo}</span>

  const direcaoAtual = ordenacao?.campo === campo ? ordenacao.direcao : undefined
  const Icone = direcaoAtual === 'asc' ? ArrowUp : direcaoAtual === 'desc' ? ArrowDown : ChevronsUpDown

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 h-8"
      aria-label={`Ordenar por ${titulo}`}
      onClick={() => aoOrdenar({ campo, direcao: direcaoAtual === 'asc' ? 'desc' : 'asc' })}
    >
      <span>{titulo}</span>
      <Icone aria-hidden="true" />
    </Button>
  )
}
