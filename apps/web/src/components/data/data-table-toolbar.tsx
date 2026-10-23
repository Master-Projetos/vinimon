import { Search } from 'lucide-react'
import type * as React from 'react'
import { Input } from '@/components/ui/input'

export interface DataTableToolbarProps {
  busca?: string
  aoMudarBusca?: (valor: string) => void
  rotuloBusca?: string
  children?: React.ReactNode
}

/** Barra de ferramentas: busca (opcional) e filtros, passados como filhos. */
export function DataTableToolbar({ busca, aoMudarBusca, rotuloBusca = 'Buscar', children }: DataTableToolbarProps) {
  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      {aoMudarBusca ? (
        <div className="relative w-full sm:w-64">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={busca ?? ''}
            onChange={(evento) => aoMudarBusca(evento.target.value)}
            placeholder={rotuloBusca}
            aria-label={rotuloBusca}
            className="pl-8"
          />
        </div>
      ) : null}
      {children}
    </div>
  )
}
