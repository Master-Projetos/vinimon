import { redirect } from '@tanstack/react-router'
import { type Permissao, type SessaoResposta, temPermissao } from '@vinimon/shared'

/**
 * Guarda de permissão para o `beforeLoad` de uma rota (§6.6). Sem a permissão (ou sem usuário na sessão),
 * redireciona para `/sem-permissao`. Com ela, devolve a sessão do contexto, como `_app` faz.
 *
 * Uso: `beforeLoad: ({ context }) => exigir('inventario.ver')(context)`.
 */
export function exigir(permissao: Permissao) {
  return (contexto: { sessao: SessaoResposta }): SessaoResposta => {
    const perfil = contexto.sessao.usuario?.perfil
    if (perfil === undefined || !temPermissao(perfil, permissao)) throw redirect({ to: '/sem-permissao' })
    return contexto.sessao
  }
}
