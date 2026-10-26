import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  type ContagemNotificacoes,
  type FiltroNotificacao,
  type NotificacaoDTO,
  type NotificacoesPagina,
  notificacoesApi,
  type PreferenciasNotificacao,
} from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const notificacaoChaves = {
  tudo: ['notificacoes'] as const,
  contagem: () => [...notificacaoChaves.tudo, 'contagem'] as const,
  listas: () => [...notificacaoChaves.tudo, 'lista'] as const,
  lista: (filtro: FiltroNotificacao) => [...notificacaoChaves.listas(), filtro] as const,
  preferencias: () => [...notificacaoChaves.tudo, 'preferencias'] as const,
}

export const notificacaoConsultas = {
  contagem: () =>
    queryOptions({
      queryKey: notificacaoChaves.contagem(),
      queryFn: ({ signal }) => chamar(notificacoesApi.contagem, {}, signal),
      staleTime: 60_000,
    }),
  lista: (filtro: FiltroNotificacao) =>
    infiniteQueryOptions({
      queryKey: notificacaoChaves.lista(filtro),
      queryFn: ({ pageParam, signal }) =>
        chamar(
          notificacoesApi.listar,
          { query: { filtro, limite: 20, ...(pageParam ? { cursor: pageParam } : {}) } },
          signal,
        ),
      initialPageParam: '',
      getNextPageParam: (ultima: NotificacoesPagina) => ultima.proximoCursor ?? undefined,
    }),
  preferencias: () =>
    queryOptions({
      queryKey: notificacaoChaves.preferencias(),
      queryFn: ({ signal }) => chamar(notificacoesApi.preferencias, {}, signal),
      staleTime: 5 * 60_000,
    }),
}

export function useContagemNotificacoes(): number {
  return useQuery(notificacaoConsultas.contagem()).data?.naoLidas ?? 0
}

export function usePreferenciasNotificacao(): PreferenciasNotificacao | undefined {
  return useQuery(notificacaoConsultas.preferencias()).data
}

/** Grava a contagem direto no cache (evento `notificacao:nova` ou `notificacao:contagem`) e atualiza as listas. */
export function gravarContagem(queryClient: QueryClient, naoLidas: number): void {
  queryClient.setQueryData<ContagemNotificacoes>(notificacaoChaves.contagem(), { naoLidas })
  void queryClient.invalidateQueries({ queryKey: notificacaoChaves.listas() })
}

function aposMarcar(queryClient: QueryClient, contagem: ContagemNotificacoes): void {
  gravarContagem(queryClient, contagem.naoLidas)
}

export function useMarcarLida() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (n: Pick<NotificacaoDTO, 'id' | 'lida'>) =>
      chamar(n.lida ? notificacoesApi.marcarNaoLida : notificacoesApi.marcarLida, { params: { id: n.id } }),
    onSuccess: (c) => aposMarcar(queryClient, c),
  })
}

export function useMarcarTodasLidas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => chamar(notificacoesApi.marcarTodasLidas, { body: {} }),
    onSuccess: (c) => aposMarcar(queryClient, c),
  })
}
