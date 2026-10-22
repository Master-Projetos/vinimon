import type { Table } from '@tanstack/react-table'
import { Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { gravar } from '@/lib/storage'

export interface DataTableColumnToggleProps<TData> {
  table: Table<TData>
  chavePersistencia: string
}

/** Alternador de colunas. A visibilidade é gravada em `vinimon:<chavePersistencia>` (lib/storage). */
export function DataTableColumnToggle<TData>({ table, chavePersistencia }: DataTableColumnToggleProps<TData>) {
  const colunas = table.getAllLeafColumns().filter((coluna) => coluna.getCanHide())

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Columns3 aria-hidden="true" />
          Colunas
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Mostrar colunas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {colunas.map((coluna) => (
          <DropdownMenuCheckboxItem
            key={coluna.id}
            checked={coluna.getIsVisible()}
            onSelect={(evento) => evento.preventDefault()}
            onCheckedChange={(valor) => {
              const proximo = { ...table.getState().columnVisibility, [coluna.id]: valor === true }
              table.setColumnVisibility(proximo)
              gravar(chavePersistencia, proximo)
            }}
          >
            {typeof coluna.columnDef.header === 'string' ? coluna.columnDef.header : coluna.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
