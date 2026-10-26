import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type CriarTag, type ListarTagsQuery, tagsApi } from '@vinimon/shared'
import { useExcluirCadastro } from '@/features/admin/excluir'
import { chamar } from '@/lib/api'

export const tagChaves = {
  todas: ['tags'] as const,
  lista: (q: Partial<ListarTagsQuery>) => ['tags', 'lista', q] as const,
}

export const tagsConsultas = {
  lista: (q: Partial<ListarTagsQuery>) =>
    queryOptions({
      queryKey: tagChaves.lista(q),
      queryFn: ({ signal }) => chamar(tagsApi.listar, { query: q }, signal),
    }),
}

export function useSalvarTag(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarTag) =>
      id === null ? chamar(tagsApi.criar, { body: dados }) : chamar(tagsApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: tagChaves.todas })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}

export function useExcluirTag() {
  return useExcluirCadastro((id) => chamar(tagsApi.excluir, { params: { id } }), [tagChaves.todas])
}
