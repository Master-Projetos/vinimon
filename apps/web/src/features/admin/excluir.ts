import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * Exclusão de um cadastro (`DELETE /<recurso>/:id`). Relê as listas do próprio cadastro e o `meta`
 * (os catálogos das telas). Quem chama mostra o toast com a mensagem do servidor (409 "em uso", etc.).
 */
export function useExcluirCadastro(
  executar: (id: number) => Promise<unknown>,
  invalidar: ReadonlyArray<readonly unknown[]>,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: executar,
    onSuccess: async () => {
      for (const queryKey of [...invalidar, ['meta']]) await qc.invalidateQueries({ queryKey })
    },
    meta: { silenciarErro: true },
  })
}
