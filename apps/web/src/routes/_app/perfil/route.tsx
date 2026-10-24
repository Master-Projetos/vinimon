import { createFileRoute, Outlet } from '@tanstack/react-router'
import { ErrorState } from '@/components/feedback/error-state'
import { RouteTabs } from '@/components/layout/route-tabs'

export const Route = createFileRoute('/_app/perfil')({
  component: PerfilLayout,
  errorComponent: ({ error, reset }) => <ErrorState erro={error} aoTentarNovamente={reset} />,
})

function PerfilLayout() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-(--pane-px)">
      <h1 className="text-title" tabIndex={-1}>
        Meu perfil
      </h1>
      <div className="border-b">
        <RouteTabs
          rotulo="Seções do perfil"
          itens={[
            { to: '/perfil', rotulo: 'Conta', exact: true },
            { to: '/perfil/aparencia', rotulo: 'Aparência' },
            { to: '/perfil/notificacoes', rotulo: 'Notificações' },
          ]}
        />
      </div>
      <Outlet />
    </div>
  )
}
