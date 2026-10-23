import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type CriarCanal, canaisApi, type ListarCanaisQuery } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const canalChaves = {
  todos: ['canais'] as const,
  lista: (q: Partial<ListarCanaisQuery>) => ['canais', 'lista', q] as const,
}

export const canaisConsultas = {
  lista: (q: Partial<ListarCanaisQuery>) =>
    queryOptions({
      queryKey: canalChaves.lista(q),
      queryFn: ({ signal }) => chamar(canaisApi.listar, { query: q }, signal),
    }),
}

export function useSalvarCanal(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarCanal) =>
      id === null
        ? chamar(canaisApi.criar, { body: dados })
        : chamar(canaisApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: canalChaves.todos })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}

export function useExcluirCanal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => chamar(canaisApi.excluir, { params: { id } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: canalChaves.todos })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // quem chama mostra o toast com a mensagem do servidor
  })
}
