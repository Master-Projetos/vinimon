import { queryOptions } from '@tanstack/react-query'
import { metaApi } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const metaChaves = {
  tudo: ['meta'] as const,
}

export const metaConsultas = {
  tudo: () =>
    queryOptions({
      queryKey: metaChaves.tudo,
      queryFn: ({ signal }) => chamar(metaApi.obter, {}, signal),
      staleTime: 5 * 60_000,
    }),
}
