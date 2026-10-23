import { infiniteQueryOptions } from '@tanstack/react-query'
import { assentamentosApi } from '@vinimon/shared'
import { chamar } from '@/lib/api'

/** Mensagens por página (a API devolve a mais recente primeiro, em ordem crescente dentro da página). */
export const LIMITE_CONVERSA = 50

export const conversaChaves = {
  todas: ['conversa'] as const,
  lista: (chamadoId: number) => ['conversa', chamadoId] as const,
}

export const conversaConsultas = {
  /** `pageParam` é o `antesDe` (id mais antigo da página já carregada); a primeira página não tem. */
  lista: (chamadoId: number) =>
    infiniteQueryOptions({
      queryKey: conversaChaves.lista(chamadoId),
      initialPageParam: undefined as number | undefined,
      queryFn: ({ pageParam, signal }) =>
        chamar(
          assentamentosApi.listar,
          { params: { id: chamadoId }, query: { antesDe: pageParam, limite: LIMITE_CONVERSA } },
          signal,
        ),
      getNextPageParam: (pagina) => pagina.proximoCursor ?? undefined,
    }),
}
