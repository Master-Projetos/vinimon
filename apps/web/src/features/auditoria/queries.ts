import { queryOptions } from '@tanstack/react-query'
import { auditoriaApi, type ListarAuditoriaQuery } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const auditoriaChaves = {
  lista: (q: Partial<ListarAuditoriaQuery>) => ['auditoria', 'lista', q] as const,
}

export const auditoriaConsultas = {
  lista: (q: Partial<ListarAuditoriaQuery>) =>
    queryOptions({
      queryKey: auditoriaChaves.lista(q),
      queryFn: ({ signal }) => chamar(auditoriaApi.listar, { query: q }, signal),
    }),
}
