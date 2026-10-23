import { type QueryClient, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  authApi,
  type EntrarBody,
  type EstadoSessao,
  type SessaoResposta,
  type Verificar2faBody,
} from '@vinimon/shared'
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

/**
 * Caminho para onde ir depois de uma resposta de auth (S79: o redirect já chega validado pela rota).
 * `null` = ainda falta o 2FA; a tela fica na etapa de verificação.
 */
export function destinoPorEstado(estado: EstadoSessao, redirect: string | undefined): string | null {
  if (estado === 'PENDENTE_MFA') return null
  if (estado === 'TROCA_SENHA') return '/trocar-senha'
  if (estado === 'CADASTRO_MFA') return '/configurar-2fa'
  return redirect ?? '/'
}

/** Guarda o CSRF em memória (S80). PENDENTE_MFA não vai para o cache: o _app trataria a sessão como logada. */
function aplicarSessao(queryClient: QueryClient, resposta: SessaoResposta): void {
  definirCsrf(resposta.csrf)
  if (resposta.estado !== 'PENDENTE_MFA') queryClient.setQueryData(authChaves.sessao, resposta)
}

export function useEntrar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (corpo: EntrarBody) => chamar(authApi.entrar, { body: corpo }),
    onSuccess: (resposta) => aplicarSessao(queryClient, resposta),
  })
}

export function useVerificar2fa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (corpo: Verificar2faBody) => chamar(authApi.verificar2fa, { body: corpo }),
    onSuccess: (resposta) => aplicarSessao(queryClient, resposta),
  })
}
