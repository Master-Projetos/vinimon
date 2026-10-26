import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type CriarPrioridade, type ListarPrioridadesQuery, prioridadesApi } from '@vinimon/shared'
import { useExcluirCadastro } from '@/features/admin/excluir'
import { chamar } from '@/lib/api'

export const prioridadeChaves = {
  todas: ['prioridades'] as const,
  lista: (q: Partial<ListarPrioridadesQuery>) => ['prioridades', 'lista', q] as const,
}

export const prioridadesConsultas = {
  lista: (q: Partial<ListarPrioridadesQuery>) =>
    queryOptions({
      queryKey: prioridadeChaves.lista(q),
      queryFn: ({ signal }) => chamar(prioridadesApi.listar, { query: q }, signal),
    }),
}

export function useSalvarPrioridade(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarPrioridade) =>
      id === null
        ? chamar(prioridadesApi.criar, { body: dados })
        : chamar(prioridadesApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: prioridadeChaves.todas })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}

export function useExcluirPrioridade() {
  return useExcluirCadastro((id) => chamar(prioridadesApi.excluir, { params: { id } }), [prioridadeChaves.todas])
}
