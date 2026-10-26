import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'
import { z } from 'zod'
import { ErrorState } from '@/components/feedback/error-state'
import { CategoriasPane } from '@/features/conhecimento/components/categorias-pane'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
  categoriaId: z.int().positive().optional(),
})

export const Route = createFileRoute('/_app/conhecimento')({
  validateSearch: BuscaSchema,
  errorComponent: ({ error, reset }) => <ErrorState erro={error} aoTentarNovamente={reset} />,
  component: ConhecimentoLayout,
})

function ConhecimentoLayout() {
  const { categoriaId } = Route.useSearch()
  const caminho = useLocation({ select: (l) => l.pathname.replace(/\/$/, '') })
  // O painel de categorias só faz sentido na lista; artigo e editor usam a largura toda.
  const naLista = caminho === '/conhecimento'
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {naLista ? <CategoriasPane categoriaId={categoriaId} /> : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}
