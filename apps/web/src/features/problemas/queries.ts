import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type CriarProblema, type ListarProblemasQuery, problemasApi } from '@vinimon/shared'
import { useExcluirCadastro } from '@/features/admin/excluir'
import { chamar } from '@/lib/api'

export const problemaChaves = {
  todos: ['problemas'] as const,
  lista: (q: Partial<ListarProblemasQuery>) => ['problemas', 'lista', q] as const,
}

export const problemasConsultas = {
  lista: (q: Partial<ListarProblemasQuery>) =>
    queryOptions({
      queryKey: problemaChaves.lista(q),
      queryFn: ({ signal }) => chamar(problemasApi.listar, { query: q }, signal),
    }),
}

export function useSalvarProblema(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarProblema) =>
      id === null
        ? chamar(problemasApi.criar, { body: dados })
        : chamar(problemasApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: problemaChaves.todos })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}

export function useExcluirProblema() {
  return useExcluirCadastro((id) => chamar(problemasApi.excluir, { params: { id } }), [problemaChaves.todos])
}
