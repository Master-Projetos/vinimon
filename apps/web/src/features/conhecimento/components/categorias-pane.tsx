import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ErrorState } from '@/components/feedback/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { artigosConsultas } from '../queries'

export interface CategoriasPaneProps {
  categoriaId: number | undefined
}

const CLASSE_ITEM =
  'flex items-center rounded-md px-3 py-2 text-sm whitespace-nowrap outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50'

/** Painel de categorias da base de conhecimento; trocar de categoria só muda `?categoriaId=`. */
export function CategoriasPane({ categoriaId }: CategoriasPaneProps) {
  const categorias = useQuery(artigosConsultas.categorias())
  return (
    <nav aria-label="Categorias" className="shrink-0 border-b p-2 md:w-60 md:border-r md:border-b-0 md:p-3">
      {categorias.isError ? (
        <ErrorState compacto erro={categorias.error} aoTentarNovamente={() => void categorias.refetch()} />
      ) : categorias.isPending ? (
        <Skeleton role="status" aria-label="Carregando categorias" className="h-24 w-full" />
      ) : (
        <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          <li className="shrink-0">
            <Link
              to="/conhecimento"
              search={(anterior) => ({ ...anterior, categoriaId: undefined, pagina: undefined })}
              aria-current={categoriaId === undefined ? 'page' : undefined}
              className={cn(CLASSE_ITEM, categoriaId === undefined && 'bg-accent font-medium')}
            >
              Todas
            </Link>
          </li>
          {categorias.data.itens
            .toSorted((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
            .map((c) => (
              <li key={c.id} className="shrink-0">
                <Link
                  to="/conhecimento"
                  search={(anterior) => ({ ...anterior, categoriaId: c.id, pagina: undefined })}
                  aria-current={categoriaId === c.id ? 'page' : undefined}
                  className={cn(CLASSE_ITEM, categoriaId === c.id && 'bg-accent font-medium')}
                >
                  {c.nome}
                </Link>
              </li>
            ))}
        </ul>
      )}
    </nav>
  )
}
