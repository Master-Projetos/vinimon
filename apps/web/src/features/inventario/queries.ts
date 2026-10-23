import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type AtualizarAtivo, ativosApi, type CriarAtivo, type ListarAtivosQuery } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const ativoChaves = {
  todos: ['ativos'] as const,
  lista: (q: Partial<ListarAtivosQuery>) => ['ativos', 'lista', q] as const,
}

export const ativosConsultas = {
  lista: (q: Partial<ListarAtivosQuery>) =>
    queryOptions({
      queryKey: ativoChaves.lista(q),
      queryFn: ({ signal }) => chamar(ativosApi.listar, { query: q }, signal),
      placeholderData: keepPreviousData,
    }),
}

export function useSalvarAtivo(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarAtivo | AtualizarAtivo) =>
      id === null
        ? chamar(ativosApi.criar, { body: dados as CriarAtivo })
        : chamar(ativosApi.atualizar, { params: { id }, body: dados }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ativoChaves.todos }),
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}
