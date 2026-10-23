import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type CriarDepartamento, departamentosApi, type ListarDepartamentosQuery } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const departamentoChaves = {
  todos: ['departamentos'] as const,
  lista: (q: Partial<ListarDepartamentosQuery>) => ['departamentos', 'lista', q] as const,
}

export const departamentosConsultas = {
  lista: (q: Partial<ListarDepartamentosQuery>) =>
    queryOptions({
      queryKey: departamentoChaves.lista(q),
      queryFn: ({ signal }) => chamar(departamentosApi.listar, { query: q }, signal),
    }),
}

export function useSalvarDepartamento(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarDepartamento) =>
      id === null
        ? chamar(departamentosApi.criar, { body: dados })
        : chamar(departamentosApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: departamentoChaves.todos })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}
