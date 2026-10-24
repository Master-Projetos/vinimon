import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type AtualizarConfig, configApi } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const configChaves = {
  tudo: ['config'] as const,
}

export const configConsultas = {
  obter: () =>
    queryOptions({
      queryKey: configChaves.tudo,
      queryFn: ({ signal }) => chamar(configApi.obter, {}, signal),
    }),
}

/** Cada seção manda só as suas chaves. Salvar invalida `['meta']` (a configuração pública sai de lá). */
export function useSalvarConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: AtualizarConfig) => chamar(configApi.atualizar, { body: dados }),
    onSuccess: async (config) => {
      qc.setQueryData(configChaves.tudo, config)
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (erro nos campos)
  })
}
