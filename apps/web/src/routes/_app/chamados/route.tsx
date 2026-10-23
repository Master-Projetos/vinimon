import { createFileRoute, Outlet, useLocation, useRouteContext } from '@tanstack/react-router'
import { VisoesPane } from '@/features/chamados/components/visoes-pane'
import { type ChamadoBusca, ChamadoBuscaSchema } from '@/features/chamados/filtros'

export const Route = createFileRoute('/_app/chamados')({
  validateSearch: ChamadoBuscaSchema,
  component: ChamadosLayout,
})

function ChamadosLayout() {
  const { sessao } = useRouteContext({ from: '/_app' })
  const busca: ChamadoBusca = Route.useSearch()
  const caminho = useLocation({ select: (l) => l.pathname.replace(/\/$/, '') })
  // O painel de visões só faz sentido na lista; /novo e /$chamadoId usam a largura toda.
  const naLista = caminho === '/chamados'
  const perfil = sessao.usuario?.perfil

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {naLista && perfil ? <VisoesPane perfil={perfil} busca={busca} /> : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}
