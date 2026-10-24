import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { artigosApi, type CriarArtigo, categoriasArtigoApi, type ListarArtigosQuery } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const artigoChaves = {
  todos: ['artigos'] as const,
  lista: (q: Partial<ListarArtigosQuery>) => ['artigos', 'lista', q] as const,
  detalhe: (id: number) => ['artigos', 'detalhe', id] as const,
}

export const artigosConsultas = {
  lista: (q: Partial<ListarArtigosQuery>) =>
    queryOptions({
      queryKey: artigoChaves.lista(q),
      queryFn: ({ signal }) => chamar(artigosApi.listar, { query: q }, signal),
    }),
  detalhe: (id: number) =>
    queryOptions({
      queryKey: artigoChaves.detalhe(id),
      queryFn: ({ signal }) => chamar(artigosApi.obter, { params: { id } }, signal),
    }),
  categorias: () =>
    queryOptions({
      queryKey: ['categorias-artigo', 'ativas'] as const,
      queryFn: ({ signal }) =>
        chamar(categoriasArtigoApi.listar, { query: { pagina: 1, porPagina: 100, ativo: true } }, signal),
    }),
}

/** "Foi útil?": registra o voto e atualiza os contadores do artigo. */
export function useVotarArtigo(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (util: boolean) => chamar(artigosApi.votar, { params: { id }, body: { util } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: artigoChaves.detalhe(id) }),
  })
}

export function useSalvarArtigo(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarArtigo) =>
      id === null
        ? chamar(artigosApi.criar, { body: dados })
        : chamar(artigosApi.atualizar, { params: { id }, body: dados }),
    onSuccess: () => qc.invalidateQueries({ queryKey: artigoChaves.todos }),
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}

export function useExcluirArtigo(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => chamar(artigosApi.excluir, { params: { id } }),
    onSuccess: async () => {
      qc.removeQueries({ queryKey: artigoChaves.detalhe(id) })
      await qc.invalidateQueries({ queryKey: artigoChaves.todos })
    },
  })
}
