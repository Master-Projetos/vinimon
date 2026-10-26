import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { type AtualizarModeloEmail, type EnviarTesteEmail, modelosEmailApi } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const modeloEmailChaves = {
  todos: ['modelos-email'] as const,
  lista: () => ['modelos-email', 'lista'] as const,
}

export const modelosEmailConsultas = {
  lista: () =>
    queryOptions({
      queryKey: modeloEmailChaves.lista(),
      queryFn: ({ signal }) => chamar(modelosEmailApi.listar, {}, signal),
    }),
}

export function useSalvarModeloEmail(evento: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: AtualizarModeloEmail) => chamar(modelosEmailApi.atualizar, { params: { evento }, body: dados }),
    onSuccess: () => qc.invalidateQueries({ queryKey: modeloEmailChaves.todos }),
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}

export function useEnviarTesteEmail() {
  return useMutation({
    mutationFn: (dados: EnviarTesteEmail) => chamar(modelosEmailApi.enviarTeste, { body: dados }),
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}
