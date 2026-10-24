import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type AtualizarPreferencias,
  authApi,
  meApi,
  notificacoesApi,
  type SessaoDispositivo,
  type UsuarioMe,
} from '@vinimon/shared'
import { authChaves } from '@/features/auth/queries'
import { notificacaoChaves } from '@/features/notificacoes/queries'
import { chamar } from '@/lib/api'

/** `PATCH /me`: tema, densidade e "Enter envia"; o usuário devolvido substitui o da sessão em cache. */
export function useAtualizarMe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      tema?: UsuarioMe['tema']
      densidade?: NonNullable<UsuarioMe['densidade']>
      enviarComEnter?: boolean
    }) => chamar(meApi.atualizar, { body }),
    onSuccess: (usuario) => {
      queryClient.setQueryData(authChaves.sessao, (atual: unknown) =>
        typeof atual === 'object' && atual !== null ? { ...atual, usuario } : atual,
      )
    },
  })
}

/** `PUT /me/preferencias-notificacao`: a resposta vira o cache da matriz. */
export function useSalvarPreferenciasNotificacao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: AtualizarPreferencias) => chamar(notificacoesApi.atualizarPreferencias, { body }),
    onSuccess: (resposta) => queryClient.setQueryData(notificacaoChaves.preferencias(), resposta),
  })
}

export const sessoesConsulta = () =>
  queryOptions({
    queryKey: ['auth', 'sessoes'] as const,
    queryFn: ({ signal }) => chamar(authApi.sessoes, {}, signal),
  })

/** Encerra uma sessão (`DELETE /auth/sessoes/:id`) e relê a lista. */
export function useRevogarSessao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => chamar(authApi.revogarSessao, { params: { id } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: sessoesConsulta().queryKey }),
  })
}

/** "Encerrar as outras": a API só encerra uma por vez ou todas (inclusive a atual), então revoga cada outra sessão. */
export function useEncerrarOutras() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sessoes: SessaoDispositivo[]) => {
      for (const s of sessoes.filter((x) => !x.atual)) await chamar(authApi.revogarSessao, { params: { id: s.id } })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: sessoesConsulta().queryKey }),
  })
}

/** Gera novos códigos de recuperação do 2FA; pede a senha e invalida os antigos (S29). */
export function useNovosCodigos2fa() {
  return useMutation({ mutationFn: (senha: string) => chamar(authApi.codigos2fa, { body: { senha } }) })
}

/** Desativa o 2FA (só USUARIO): senha e código atual. Relê a sessão para o `mfaAtivo` refletir. */
export function useDesativar2fa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { senha: string; codigo: string }) => chamar(authApi.desativar2fa, { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authChaves.sessao }),
  })
}
