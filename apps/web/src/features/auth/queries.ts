import { type QueryClient, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi, type EntrarBody, type SessaoResposta, type Verificar2faBody } from '@vinimon/shared'
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

/** Para onde ir depois de uma resposta de login ou de 2FA (o estado da sessão manda, §6.3 item 1). */
export function destinoDaSessao(estado: SessaoResposta['estado'], redirect: string | undefined): string | null {
  switch (estado) {
    case 'PENDENTE_MFA':
      return null // continua na etapa de 2FA
    case 'TROCA_SENHA':
      return '/trocar-senha'
    case 'CADASTRO_MFA':
      return '/configurar-2fa'
    case 'ATIVA':
      return redirect ?? '/'
  }
}

/** Grava a sessão devolvida (CSRF só em memória, S80) e semeia o cache para o guarda de `_app`. */
function aceitarSessao(queryClient: QueryClient, s: SessaoResposta): void {
  definirCsrf(s.csrf)
  queryClient.setQueryData(authChaves.sessao, s)
}

export function useEntrar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: EntrarBody) => chamar(authApi.entrar, { body }),
    onSuccess: (s) => aceitarSessao(queryClient, s),
  })
}

export function useVerificar2fa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Verificar2faBody) => chamar(authApi.verificar2fa, { body }),
    onSuccess: (s) => aceitarSessao(queryClient, s),
  })
}
