import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type AtualizarUsuario,
  type CriarUsuario,
  type ListarUsuariosQuery,
  type Resetar2fa,
  usuariosApi,
} from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const usuarioChaves = {
  todos: ['usuarios'] as const,
  lista: (q: Partial<ListarUsuariosQuery>) => ['usuarios', 'lista', q] as const,
}

export const usuariosConsultas = {
  lista: (q: Partial<ListarUsuariosQuery>) =>
    queryOptions({
      queryKey: usuarioChaves.lista(q),
      queryFn: ({ signal }) => chamar(usuariosApi.listar, { query: q }, signal),
    }),
}

/** Quando o formulário edita, manda só o que o `PATCH` aceita; quando cria, devolve também a senha temporária. */
export type DadosUsuario = { criar: CriarUsuario } | { atualizar: AtualizarUsuario }

export function useSalvarUsuario(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dados: DadosUsuario) => {
      if ('criar' in dados) return chamar(usuariosApi.criar, { body: dados.criar })
      if (id === null) throw new Error('Usuário sem id.')
      const usuario = await chamar(usuariosApi.atualizar, { params: { id }, body: dados.atualizar })
      return { usuario, senhaTemporaria: null }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: usuarioChaves.todos }),
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}

/**
 * Ações administrativas (S16, S31, S48, S122). Cada uma invalida a lista; quem chama mostra o resultado
 * (a senha temporária, por exemplo) e o erro.
 */
export function useAcoesUsuario() {
  const qc = useQueryClient()
  const aoConcluir = () => qc.invalidateQueries({ queryKey: usuarioChaves.todos })
  const opcoes = { onSuccess: aoConcluir, meta: { silenciarErro: true } } as const
  return {
    redefinirSenha: useMutation({
      mutationFn: (id: number) => chamar(usuariosApi.redefinirSenha, { params: { id }, body: {} }),
      ...opcoes,
    }),
    resetar2fa: useMutation({
      mutationFn: ({ id, corpo }: { id: number; corpo: Resetar2fa }) =>
        chamar(usuariosApi.resetar2fa, { params: { id }, body: corpo }),
      ...opcoes,
    }),
    encerrarSessoes: useMutation({
      mutationFn: (id: number) => chamar(usuariosApi.encerrarSessoes, { params: { id }, body: {} }),
      ...opcoes,
    }),
    desbloquearLogin: useMutation({
      mutationFn: (id: number) => chamar(usuariosApi.desbloquearLogin, { params: { id }, body: {} }),
      ...opcoes,
    }),
    anonimizar: useMutation({
      mutationFn: (id: number) => chamar(usuariosApi.anonimizar, { params: { id }, body: {} }),
      ...opcoes,
    }),
  }
}
