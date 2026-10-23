import { createFileRoute, Outlet } from '@tanstack/react-router'
import { ErrorState } from '@/components/feedback/error-state'
import { AdminNavPane } from '@/features/admin/components/admin-nav-pane'
import { exigir } from '@/features/auth/guards'

export const Route = createFileRoute('/_app/admin')({
  beforeLoad: ({ context }) => exigir('cadastro.gerenciar')(context),
  component: AdminLayout,
  errorComponent: ({ error, reset }) => <ErrorState erro={error} aoTentarNovamente={reset} />,
})

function AdminLayout() {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <AdminNavPane />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
