import { type QueryClient, useQuery } from '@tanstack/react-query'
import type { EstadoPresenca, EventosServidor } from '@vinimon/shared'

/** Tempo sem entrada do usuário para a presença passar a "ausente por inatividade" (§3.7). */
export const OCIOSO_MS = 5 * 60_000

/** Chaves de cache da presença: o mapa `usuarioId → estado` dos assinados e a presença do próprio usuário. */
export const presencaChaves = {
  tudo: ['presenca'] as const,
  mapa: ['presenca', 'mapa'] as const,
  propria: ['presenca', 'propria'] as const,
}

export type MapaPresenca = Record<number, EstadoPresenca>

/** Presença do próprio usuário (a última recebida em `presenca:propria` ou na resposta do `PUT /me/presenca`). */
export type PresencaDoUsuario = Parameters<EventosServidor['presenca:propria']>[0]

/**
 * Funde estados no mapa em cache. Só grava quando algo mudou, para não acordar quem não depende da mudança.
 * Fica no QueryClient: o mesmo mapa serve a todos os avatares da tela, sem re-render em cascata.
 */
export function mesclarPresencas(
  queryClient: QueryClient,
  novos: ReadonlyArray<{ usuarioId: number; estado: EstadoPresenca }>,
): void {
  const atual = queryClient.getQueryData<MapaPresenca>(presencaChaves.mapa) ?? {}
  if (novos.every((n) => atual[n.usuarioId] === n.estado)) return
  const proximo: MapaPresenca = { ...atual }
  for (const n of novos) proximo[n.usuarioId] = n.estado
  queryClient.setQueryData<MapaPresenca>(presencaChaves.mapa, proximo)
}

/** Leitura da presença do próprio usuário (sem consulta HTTP: o dado chega pelo socket e pelo PUT). */
export function usePresencaPropria(): PresencaDoUsuario | null {
  const { data } = useQuery<PresencaDoUsuario | null>({
    queryKey: presencaChaves.propria,
    queryFn: ({ client }) => client.getQueryData<PresencaDoUsuario | null>(presencaChaves.propria) ?? null,
    initialData: null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  })
  return data
}
