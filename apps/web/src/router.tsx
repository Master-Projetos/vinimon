import type { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { ErrorState } from '@/components/feedback/error-state'
import { NotFoundState } from '@/components/feedback/not-found-state'
import { PageSkeleton } from '@/components/feedback/page-skeleton'
import { routeTree } from './routeTree.gen'

export function criarRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
    defaultPendingComponent: PageSkeleton,
    defaultErrorComponent: ({ error, reset }) => <ErrorState erro={error} aoTentarNovamente={reset} />,
    defaultNotFoundComponent: () => <NotFoundState />,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof criarRouter>
  }
}
