import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { SessaoResposta } from '@vinimon/shared'
import { DensityProvider } from '@/components/theme/density-provider'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { authChaves } from '@/features/auth/queries'
import { routeTree as arvoreReal } from '@/routeTree.gen'
import { type ApiFalsa, apiFalsa, type RespostaFalsa } from './api-falsa'

export interface OpcoesRenderRota {
  sessao: SessaoResposta
  respostas: Record<'GET /areas' | string, RespostaFalsa>
  /** Árvore de rotas alternativa (ex.: rota de teste). Padrão: a árvore real do app. */
  arvore?: Parameters<typeof createRouter>[0]['routeTree']
}

/**
 * Monta o app em `caminho` (memória, sem tocar na URL do jsdom), com os providers reais e a árvore
 * de rotas real (ou `arvore`). A sessão já vem semeada no cache, então `_app` não chama a API.
 */
export function renderRota(caminho: string, opcoes: OpcoesRenderRota) {
  const falsa: ApiFalsa = apiFalsa(opcoes.respostas)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(authChaves.sessao, opcoes.sessao)

  const router = createRouter({
    routeTree: opcoes.arvore ?? arvoreReal,
    history: createMemoryHistory({ initialEntries: [caminho] }),
    context: { queryClient },
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  })

  const resultado = render(
    <ThemeProvider>
      <DensityProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <Toaster />
        </QueryClientProvider>
      </DensityProvider>
    </ThemeProvider>,
  )
  return { ...resultado, falsa, queryClient, router }
}
