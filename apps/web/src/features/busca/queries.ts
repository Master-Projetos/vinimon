import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { type BuscaQuery, buscaApi } from '@vinimon/shared'
import { chamar } from '@/lib/api'

/** Mesma regra da API: 2+ caracteres, ou um número de chamado (`123`, `#123`). */
export function buscaValida(q: string): boolean {
  const t = q.trim()
  return t.length >= 2 || /^#?\d+$/.test(t)
}

export const buscaChaves = { tudo: ['busca'] as const, termo: (q: string) => ['busca', q] as const }

export const buscaConsultas = {
  termo: (q: string) =>
    queryOptions({
      queryKey: buscaChaves.termo(q),
      queryFn: ({ signal }) =>
        chamar(buscaApi.buscar, { query: { q, limite: 5 } satisfies Partial<BuscaQuery> }, signal),
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    }),
}

export function useBusca(q: string) {
  const termo = q.trim()
  return useQuery({ ...buscaConsultas.termo(termo), enabled: buscaValida(termo) })
}
