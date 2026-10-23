import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type CriarTipoAtivo, type ListarTiposAtivoQuery, tiposAtivoApi } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const tipoAtivoChaves = {
  todas: ['tipos-ativo'] as const,
  lista: (q: Partial<ListarTiposAtivoQuery>) => ['tipos-ativo', 'lista', q] as const,
}

export const tiposAtivoConsultas = {
  lista: (q: Partial<ListarTiposAtivoQuery>) =>
    queryOptions({
      queryKey: tipoAtivoChaves.lista(q),
      queryFn: ({ signal }) => chamar(tiposAtivoApi.listar, { query: q }, signal),
    }),
}

export function useSalvarTipoAtivo(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarTipoAtivo) =>
      id === null
        ? chamar(tiposAtivoApi.criar, { body: dados })
        : chamar(tiposAtivoApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: tipoAtivoChaves.todas })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}
