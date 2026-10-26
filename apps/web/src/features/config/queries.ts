import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type AtualizarConfig, configApi, contrato, usuariosApi } from '@vinimon/shared'
import { z } from 'zod'
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

/** POST /config/ldap/testar (config.gerenciar): confere conexão, CA e bind de serviço. */
export const testarLdapApi = contrato({
  metodo: 'POST',
  caminho: '/config/ldap/testar',
  body: z.strictObject({}),
  resposta: z.object({ ok: z.boolean(), mensagem: z.string() }),
})

export function useTestarLdap() {
  return useMutation({
    mutationFn: () => chamar(testarLdapApi, { body: {} }),
    meta: { silenciarErro: true },
  })
}

/** Colegas do mesmo departamento para "Para outro colega" (B03); vazio com a regra desligada. */
export const buscarColegas = (termo: string, signal: AbortSignal) =>
  chamar(usuariosApi.mesmoDepartamento, { query: { q: termo.trim() } }, signal)
