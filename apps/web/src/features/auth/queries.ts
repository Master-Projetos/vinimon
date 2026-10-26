import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  authApi,
  type EntrarBody,
  type SessaoResposta,
  type TrocarSenhaBody,
  type Verificar2faBody,
} from '@vinimon/shared'
import { chamar, definirCsrf, ErroApi } from '@/lib/api'
import { limparDadosDoUsuario } from '@/lib/storage'

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

export function useTrocarSenha() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: TrocarSenhaBody) => chamar(authApi.trocarSenha, { body }),
    onSuccess: (s) => aceitarSessao(queryClient, s),
  })
}

/**
 * Inicia o cadastro do 2FA: o segredo e o `otpauthUri` nascem no servidor e valem para esta tela. Uma vez só por
 * visita (`staleTime` infinito, sem repetição): refazer geraria outro segredo e invalidaria o QR já escaneado.
 */
export function useIniciar2fa() {
  return useQuery({
    queryKey: ['auth', '2fa', 'iniciar'],
    queryFn: ({ signal }) => chamar(authApi.iniciar2fa, {}, signal),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

/** Confirma o 2FA. Os códigos de recuperação vêm uma única vez e ficam só em memória, na tela. */
export function useConfirmar2fa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (codigo: string) => chamar(authApi.confirmar2fa, { body: { codigo } }),
    onSuccess: (r) => aceitarSessao(queryClient, r.sessao),
  })
}

/**
 * Sair: encerra a sessão no servidor e depois apaga tudo o que era do usuário no navegador (cache, CSRF em memória,
 * `vinimon:u*` e a conexão em tempo real). Tema e densidade ficam (S80).
 */
export function useSair() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => chamar(authApi.sair, {}),
    onSettled: async () => {
      // Carregado sob demanda: o socket só existe dentro de `_app` e não deve pesar no JS inicial do /login.
      try {
        const { tempoRealAtual } = await import('@/lib/socket')
        tempoRealAtual()?.encerrar()
      } catch {
        // sem o módulo de tempo real não há o que encerrar; a limpeza abaixo continua
      }
      definirCsrf(null)
      limparDadosDoUsuario()
      queryClient.clear()
    },
  })
}
