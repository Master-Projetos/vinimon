import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ErroApi } from './api'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { silenciarErro?: boolean; erroTitulo?: string }
  }
}

export function criarQueryClient(aoSessaoExpirar: () => void): QueryClient {
  const tratar401 = (e: unknown) => {
    if (e instanceof ErroApi && e.status === 401) aoSessaoExpirar()
  }
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 300_000,
        retry: (n, e) => !(e instanceof ErroApi && e.status >= 400 && e.status < 500) && n < 2,
      },
    },
    queryCache: new QueryCache({ onError: tratar401 }),
    mutationCache: new MutationCache({
      onError: (e, _variaveis, _resultado, mutacao) => {
        tratar401(e)
        if (mutacao.meta?.silenciarErro) return
        toast.error(mutacao.meta?.erroTitulo ?? 'Não foi possível concluir a ação', { description: e.message })
      },
    }),
  })
}
