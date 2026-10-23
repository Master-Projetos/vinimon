import type { AtualizarMe, UsuarioMe } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { prisma } from '../../lib/prisma'
import { obterUsuarioMe } from '../auth/service'

/** Só os campos editáveis pelo próprio usuário entram na auditoria (sem senha, segredo 2FA ou hash). */
const selectEditavel = {
  nome: true,
  email: true,
  telefone: true,
  tema: true,
  densidade: true,
  enviarComEnter: true,
} satisfies Prisma.UsuarioSelect

/**
 * Atualiza o próprio perfil. Chave fora de AtualizarMeSchema (ex.: perfil) já deu 400 antes daqui.
 * E-mail já usado por outro usuário → P2002 → 409 (rollback). Auditoria `usuario.alterado` com antes/depois.
 */
export async function atualizarMe(dados: AtualizarMe, ctx: ContextoUsuario): Promise<UsuarioMe> {
  const id = ctx.usuario.id
  await prisma.$transaction(async (tx) => {
    const antes = await tx.usuario.findUniqueOrThrow({ where: { id }, select: selectEditavel })
    const depois = await tx.usuario.update({
      where: { id },
      data: {
        nome: dados.nome,
        email: dados.email,
        telefone: dados.telefone,
        tema: dados.tema,
        densidade: dados.densidade,
        enviarComEnter: dados.enviarComEnter,
      },
      select: selectEditavel,
    })
    await auditar(tx, ctx, { acao: 'usuario.alterado', entidade: 'usuario', entidadeId: id, dados: { antes, depois } })
  })
  return obterUsuarioMe(id)
}
