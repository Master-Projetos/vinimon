import { createFileRoute, Outlet } from '@tanstack/react-router'
import { ListarAtivosQuerySchema } from '@vinimon/shared'
import { ErrorState } from '@/components/feedback/error-state'
import { exigir } from '@/features/auth/guards'
import { TiposPane } from '@/features/inventario/components/tipos-pane'

// Só o que a tela filtra; paginação e ordem de apresentação ficam por conta da lista.
export const InventarioBuscaSchema = ListarAtivosQuerySchema.pick({
  tipoId: true,
  situacao: true,
  departamentoId: true,
  busca: true,
  pagina: true,
})

export const Route = createFileRoute('/_app/inventario')({
  beforeLoad: ({ context }) => exigir('inventario.ver')(context),
  validateSearch: InventarioBuscaSchema,
  component: InventarioLayout,
  errorComponent: ({ error, reset }) => <ErrorState erro={error} aoTentarNovamente={reset} />,
})

function InventarioLayout() {
  const { tipoId } = Route.useSearch()
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <TiposPane tipoId={tipoId} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
