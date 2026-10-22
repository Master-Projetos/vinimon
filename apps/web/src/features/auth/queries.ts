import { queryOptions } from '@tanstack/react-query'
import { authApi } from '@vinimon/shared'
import { chamar, definirCsrf, ErroApi } from '@/lib/api'

export const authChaves = { sessao: ['auth', 'sessao'] as const }

export const authConsultas = {
  sessao: () =>
    queryOptions({
      queryKey: authChaves.sessao,
      queryFn: async ({ signal }) => {
        try {
          const s = await chamar(authApi.sessao, {}, signal)
          definirCsrf(s.csrf)
          return s
        } catch (e) {
          if (e instanceof ErroApi && e.status === 401) {
            definirCsrf(null)
            return null
          }
          throw e
        }
      },
      staleTime: 5 * 60_000,
    }),
}
// Em main.tsx: definirRenovadorCsrf(async () => { await queryClient.fetchQuery({ ...authConsultas.sessao(), staleTime: 0 }) })
