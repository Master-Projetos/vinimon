import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type AtualizarPreferencias, meApi, notificacoesApi, type UsuarioMe } from '@vinimon/shared'
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
