import type { AtualizarUsuarioGerido, UsuarioGerido } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado, regraNegocio } from '../../lib/erros'
import { prisma } from '../../lib/prisma'
import { desconectarSessoes, revogarSessoesDoUsuario } from '../../lib/sessao'

const selectGerido = {
  id: true,
  nome: true,
  telefone: true,
  departamentoId: true,
  ativo: true,
} satisfies Prisma.UsuarioSelect

/**
 * Só gerencia quem tem a área em `areasGeridas`. Área fora da lista dá 404, igual a área inexistente (S46).
 * Os usuários geridos são sempre USUARIO da área primária: equipe e ADMIN nunca são editados por aqui.
 */
function exigirGerente(ctx: ContextoUsuario, areaId: number): void {
  if (!(ctx.usuario.areasGeridas ?? []).includes(areaId)) throw naoEncontrado('Área não encontrada.')
}

const deUsuariosDaArea = (areaId: number): Prisma.UsuarioWhereInput => ({ areaId, perfil: 'USUARIO' })

export function listarUsuariosGeridos(areaId: number, ctx: ContextoUsuario): Promise<UsuarioGerido[]> {
  exigirGerente(ctx, areaId)
  return prisma.usuario.findMany({
    where: deUsuariosDaArea(areaId),
    select: selectGerido,
    orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    take: 500,
  })
}

/** Telefone, departamento e situação. Desativar encerra as sessões da pessoa. Sempre auditado. */
export async function atualizarUsuarioGerido(
  areaId: number,
  id: number,
  dados: AtualizarUsuarioGerido,
  ctx: ContextoUsuario,
): Promise<UsuarioGerido> {
  exigirGerente(ctx, areaId)
  const r = await prisma.$transaction(async (tx) => {
    const antes = await tx.usuario.findFirst({ where: { id, ...deUsuariosDaArea(areaId) }, select: selectGerido })
    if (!antes) throw naoEncontrado('Usuário não encontrado.')
    if (id === ctx.usuario.id && dados.ativo === false) throw regraNegocio('Você não pode desativar a própria conta.')
    const depois = await tx.usuario.update({
      where: { id },
      data: { telefone: dados.telefone, departamentoId: dados.departamentoId, ativo: dados.ativo },
      select: selectGerido,
    })
    const desativou = antes.ativo && !depois.ativo
    const sessoes = desativou ? await revogarSessoesDoUsuario(tx, id, 'usuario_desativado') : []
    await auditar(tx, ctx, {
      acao: 'usuario.alterado',
      entidade: 'usuario',
      entidadeId: id,
      dados: { antes, depois, areaGeridaId: areaId },
    })
    return { depois, sessoes }
  })
  // Efeitos só depois do commit.
  desconectarSessoes(r.sessoes, 'usuario_desativado')
  return r.depois
}
