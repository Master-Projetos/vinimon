import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type CriarJornada, jornadasApi, type ListarJornadasQuery } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const jornadaChaves = {
  todas: ['jornadas'] as const,
  lista: (q: Partial<ListarJornadasQuery>) => ['jornadas', 'lista', q] as const,
}

export const jornadasConsultas = {
  lista: (q: Partial<ListarJornadasQuery>) =>
    queryOptions({
      queryKey: jornadaChaves.lista(q),
      queryFn: ({ signal }) => chamar(jornadasApi.listar, { query: q }, signal),
    }),
}

export function useSalvarJornada(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarJornada) =>
      id === null
        ? chamar(jornadasApi.criar, { body: dados })
        : chamar(jornadasApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: jornadaChaves.todas })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}
