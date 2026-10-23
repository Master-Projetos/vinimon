import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type CriarStatus, type ListarStatusQuery, statusApi } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const statusChaves = {
  todos: ['status'] as const,
  lista: (q: Partial<ListarStatusQuery>) => ['status', 'lista', q] as const,
}

export const statusConsultas = {
  lista: (q: Partial<ListarStatusQuery>) =>
    queryOptions({
      queryKey: statusChaves.lista(q),
      queryFn: ({ signal }) => chamar(statusApi.listar, { query: q }, signal),
    }),
}

export function useSalvarStatus(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarStatus) =>
      id === null
        ? chamar(statusApi.criar, { body: dados })
        : chamar(statusApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: statusChaves.todos })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}
