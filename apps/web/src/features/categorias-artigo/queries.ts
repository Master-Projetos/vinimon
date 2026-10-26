import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type CriarCategoriaArtigo, categoriasArtigoApi, type ListarCategoriasArtigoQuery } from '@vinimon/shared'
import { useExcluirCadastro } from '@/features/admin/excluir'
import { chamar } from '@/lib/api'

export const categoriaArtigoChaves = {
  todas: ['categorias-artigo'] as const,
  lista: (q: Partial<ListarCategoriasArtigoQuery>) => ['categorias-artigo', 'lista', q] as const,
}

export const categoriasArtigoConsultas = {
  lista: (q: Partial<ListarCategoriasArtigoQuery>) =>
    queryOptions({
      queryKey: categoriaArtigoChaves.lista(q),
      queryFn: ({ signal }) => chamar(categoriasArtigoApi.listar, { query: q }, signal),
    }),
}

export function useSalvarCategoriaArtigo(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarCategoriaArtigo) =>
      id === null
        ? chamar(categoriasArtigoApi.criar, { body: dados })
        : chamar(categoriasArtigoApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: categoriaArtigoChaves.todas })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}

export function useExcluirCategoriaArtigo() {
  return useExcluirCadastro(
    (id) => chamar(categoriasArtigoApi.excluir, { params: { id } }),
    [categoriaArtigoChaves.todas],
  )
}
