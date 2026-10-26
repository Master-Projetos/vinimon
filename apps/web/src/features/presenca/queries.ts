import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type DefinirPresenca, meApi, presencaApi, type UsuarioMe } from '@vinimon/shared'
import { authChaves } from '@/features/auth/queries'
import { chamar } from '@/lib/api'

/** Tempo sem entrada do usuário para a presença passar a "ausente por inatividade" (§3.7). */
export const OCIOSO_MS = 5 * 60_000

/** Chaves de cache da presença. O estado de cada pessoa vem de `usePresenca(ids)` (hooks.ts). */
export const presencaChaves = { tudo: ['presenca'] as const, propria: ['presenca', 'propria'] as const }

/** `PUT /me/presenca`: o estado manual (Ocupado/Ausente) e até quando vale; `estado: null` redefine. */
export function useDefinirPresenca() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: DefinirPresenca) => chamar(presencaApi.definir, { body }),
    onSuccess: (propria) => queryClient.setQueryData(presencaChaves.propria, propria),
  })
}

/** `PATCH /me` com tema ou densidade; devolve o usuário e o grava na sessão em cache. */
export function useAtualizarPreferencias() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { tema?: UsuarioMe['tema']; densidade?: NonNullable<UsuarioMe['densidade']> }) =>
      chamar(meApi.atualizar, { body }),
    onSuccess: (usuario) => {
      queryClient.setQueryData(authChaves.sessao, (atual: unknown) =>
        typeof atual === 'object' && atual !== null ? { ...atual, usuario } : atual,
      )
    },
  })
}
