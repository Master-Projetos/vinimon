import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ErrorState } from '@/components/feedback/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { metaConsultas } from '@/features/meta/queries'
import { cn } from '@/lib/utils'

export interface TiposPaneProps {
  tipoId: number | undefined
}

const CLASSES_ITEM = cn(
  'flex items-center rounded-md px-3 py-2 text-sm whitespace-nowrap outline-none',
  'hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
)

/** Tipos de ativo (do `meta`). Escolher um tipo só muda `?tipoId=` e volta à página 1. */
export function TiposPane({ tipoId }: TiposPaneProps) {
  const meta = useQuery(metaConsultas.tudo())

  return (
    <nav aria-label="Tipos de ativo" className="shrink-0 border-b p-2 md:w-60 md:border-r md:border-b-0 md:p-3">
      {meta.isError ? (
        <ErrorState compacto erro={meta.error} aoTentarNovamente={() => void meta.refetch()} />
      ) : meta.isPending ? (
        <Skeleton role="status" aria-label="Carregando tipos" className="h-9 w-full" />
      ) : (
        <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          <li className="shrink-0">
            <Link
              to="/inventario"
              search={(s) => ({ ...s, tipoId: undefined, pagina: undefined })}
              aria-current={tipoId === undefined ? 'page' : undefined}
              className={cn(CLASSES_ITEM, tipoId === undefined && 'bg-accent font-medium')}
            >
              Todos os tipos
            </Link>
          </li>
          {meta.data.tiposAtivo.map((tipo) => (
            <li key={tipo.id} className="shrink-0">
              <Link
                to="/inventario"
                search={(s) => ({ ...s, tipoId: tipo.id, pagina: undefined })}
                aria-current={tipoId === tipo.id ? 'page' : undefined}
                className={cn(CLASSES_ITEM, tipoId === tipo.id && 'bg-accent font-medium')}
              >
                {tipo.nome}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
