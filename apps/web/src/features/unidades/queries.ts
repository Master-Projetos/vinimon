import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type CriarUnidade, type ListarUnidadesQuery, unidadesApi } from '@vinimon/shared'
import { useExcluirCadastro } from '@/features/admin/excluir'
import { chamar } from '@/lib/api'

export const unidadeChaves = {
  todas: ['unidades'] as const,
  lista: (q: Partial<ListarUnidadesQuery>) => ['unidades', 'lista', q] as const,
}

export const unidadesConsultas = {
  lista: (q: Partial<ListarUnidadesQuery>) =>
    queryOptions({
      queryKey: unidadeChaves.lista(q),
      queryFn: ({ signal }) => chamar(unidadesApi.listar, { query: q }, signal),
    }),
}

export function useSalvarUnidade(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarUnidade) =>
      id === null
        ? chamar(unidadesApi.criar, { body: dados })
        : chamar(unidadesApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: unidadeChaves.todas })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}

export function useExcluirUnidade() {
  return useExcluirCadastro((id) => chamar(unidadesApi.excluir, { params: { id } }), [unidadeChaves.todas])
}
