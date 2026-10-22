import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const TAMANHOS = [25, 50, 100] as const

export interface DataTablePaginationProps {
  total: number
  pagina: number
  porPagina: 25 | 50 | 100
  aoMudarPagina: (p: number) => void
  aoMudarPorPagina: (n: 25 | 50 | 100) => void
}

/** Paginação controlada pelo servidor: `pagina` começa em 1. */
export function DataTablePagination({
  total,
  pagina,
  porPagina,
  aoMudarPagina,
  aoMudarPorPagina,
}: DataTablePaginationProps) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const primeira = pagina <= 1
  const ultima = pagina >= totalPaginas

  return (
    <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {total.toLocaleString('pt-BR')} {total === 1 ? 'registro' : 'registros'}
      </p>
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <div className="flex items-center gap-2 text-sm">
          <span id="data-table-por-pagina-rotulo">Linhas por página</span>
          <Select
            value={String(porPagina)}
            onValueChange={(valor) => {
              const tamanho = TAMANHOS.find((opcao) => String(opcao) === valor)
              if (tamanho) aoMudarPorPagina(tamanho)
            }}
          >
            <SelectTrigger size="sm" className="w-20" aria-labelledby="data-table-por-pagina-rotulo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAMANHOS.map((opcao) => (
                <SelectItem key={opcao} value={String(opcao)}>
                  {opcao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm">
          Página {pagina} de {totalPaginas}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Primeira página"
            disabled={primeira}
            onClick={() => aoMudarPagina(1)}
          >
            <ChevronsLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Página anterior"
            disabled={primeira}
            onClick={() => aoMudarPagina(pagina - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Próxima página"
            disabled={ultima}
            onClick={() => aoMudarPagina(pagina + 1)}
          >
            <ChevronRight />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Última página"
            disabled={ultima}
            onClick={() => aoMudarPagina(totalPaginas)}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
