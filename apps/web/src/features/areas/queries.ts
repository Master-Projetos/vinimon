import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { areasApi, type CriarArea, type ListarAreasQuery } from '@vinimon/shared'
import { useExcluirCadastro } from '@/features/admin/excluir'
import { chamar } from '@/lib/api'

export const areaChaves = {
  todas: ['areas'] as const,
  lista: (q: Partial<ListarAreasQuery>) => ['areas', 'lista', q] as const,
}

export const areasConsultas = {
  lista: (q: Partial<ListarAreasQuery>) =>
    queryOptions({
      queryKey: areaChaves.lista(q),
      queryFn: ({ signal }) => chamar(areasApi.listar, { query: q }, signal),
    }),
}

export function useSalvarArea(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarArea) =>
      id === null
        ? chamar(areasApi.criar, { body: dados })
        : chamar(areasApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: areaChaves.todas })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}

export function useExcluirArea() {
  return useExcluirCadastro((id) => chamar(areasApi.excluir, { params: { id } }), [areaChaves.todas])
}
