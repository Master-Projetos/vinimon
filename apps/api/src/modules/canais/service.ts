import type { AtualizarCanal, CriarCanal, ListarCanaisQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado, regraNegocio } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { selectCanal } from './schemas'

export async function listarCanais(q: ListarCanaisQuery) {
  const where: Prisma.CanalWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const [itens, total] = await prisma.$transaction([
    prisma.canal.findMany({
      where,
      select: selectCanal,
      orderBy: [{ nome: q.direcao }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.canal.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterCanal(id: number) {
  const canal = await prisma.canal.findUnique({ where: { id }, select: selectCanal })
  if (!canal) throw naoEncontrado('Canal não encontrado.')
  return canal
}

/** Nome duplicado → P2002 → 409 (rollback). */
export function criarCanal(dados: CriarCanal, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const canal = await tx.canal.create({
      data: { nome: dados.nome, ativo: dados.ativo },
      select: selectCanal,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'canal',
      entidadeId: canal.id,
      dados: { depois: canal },
    })
    return canal
  })
}

/** Canal de sistema não pode ser renomeado nem inativado → 422. */
export function atualizarCanal(id: number, dados: AtualizarCanal, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.canal.findUnique({ where: { id }, select: selectCanal })
    if (!antes) throw naoEncontrado('Canal não encontrado.')
    if (antes.sistema) {
      if (dados.nome !== undefined && dados.nome !== antes.nome) {
        throw regraNegocio('Canal de sistema não pode ser renomeado.')
      }
      if (dados.ativo === false) throw regraNegocio('Canal de sistema não pode ser inativado.')
    }
    const depois = await tx.canal.update({
      where: { id },
      data: { nome: dados.nome, ativo: dados.ativo },
      select: selectCanal,
    })
    await auditar(tx, ctx, { acao: 'cadastro.alterado', entidade: 'canal', entidadeId: id, dados: { antes, depois } })
    return depois
  })
}

/** Canal de sistema não pode ser excluído → 422. Canal em uso → P2003 → 409 (rollback). */
export async function excluirCanal(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.canal.findUnique({ where: { id }, select: selectCanal })
    if (!antes) throw naoEncontrado('Canal não encontrado.')
    if (antes.sistema) throw regraNegocio('Canal de sistema não pode ser excluído.')
    await tx.canal.delete({ where: { id }, select: selectCanal })
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'canal', entidadeId: id, dados: { antes } })
  })
}
