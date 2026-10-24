import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type CriarFeriado, feriadosApi, type ListarFeriadosQuery } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const feriadoChaves = {
  todas: ['feriados'] as const,
  lista: (q: Partial<ListarFeriadosQuery>) => ['feriados', 'lista', q] as const,
}

export const feriadosConsultas = {
  lista: (q: Partial<ListarFeriadosQuery>) =>
    queryOptions({
      queryKey: feriadoChaves.lista(q),
      queryFn: ({ signal }) => chamar(feriadosApi.listar, { query: q }, signal),
    }),
}

export function useSalvarFeriado(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarFeriado) =>
      id === null
        ? chamar(feriadosApi.criar, { body: dados })
        : chamar(feriadosApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: feriadoChaves.todas })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}
