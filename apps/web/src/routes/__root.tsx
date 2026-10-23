import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RaizPagina,
})

function RaizPagina() {
  return <Outlet />
}
