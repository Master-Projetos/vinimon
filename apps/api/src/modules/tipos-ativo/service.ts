import type { AtualizarTipoAtivo, CriarTipoAtivo, ListarTiposAtivoQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { selectTipoAtivo } from './schemas'

export async function listarTiposAtivo(q: ListarTiposAtivoQuery) {
  const where: Prisma.TipoAtivoWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const [itens, total] = await prisma.$transaction([
    prisma.tipoAtivo.findMany({
      where,
      select: selectTipoAtivo,
      orderBy: [{ nome: q.direcao }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.tipoAtivo.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterTipoAtivo(id: number) {
  const tipo = await prisma.tipoAtivo.findUnique({ where: { id }, select: selectTipoAtivo })
  if (!tipo) throw naoEncontrado('Tipo de ativo não encontrado.')
  return tipo
}

/** Nome duplicado → P2002 → 409 (rollback). */
export function criarTipoAtivo(dados: CriarTipoAtivo, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const tipo = await tx.tipoAtivo.create({
      data: { nome: dados.nome, ativo: dados.ativo },
      select: selectTipoAtivo,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'tipo_ativo',
      entidadeId: tipo.id,
      dados: { depois: tipo },
    })
    return tipo
  })
}

/** Nome duplicado → P2002 → 409 (rollback). */
export function atualizarTipoAtivo(id: number, dados: AtualizarTipoAtivo, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.tipoAtivo.findUnique({ where: { id }, select: selectTipoAtivo })
    if (!antes) throw naoEncontrado('Tipo de ativo não encontrado.')
    const depois = await tx.tipoAtivo.update({
      where: { id },
      data: { nome: dados.nome, ativo: dados.ativo },
      select: selectTipoAtivo,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'tipo_ativo',
      entidadeId: id,
      dados: { antes, depois },
    })
    return depois
  })
}

/** Tipo em uso por ativo → P2003 → 409 REGISTRO_EM_USO (rollback, nada é auditado). */
export async function excluirTipoAtivo(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.tipoAtivo.findUnique({ where: { id }, select: selectTipoAtivo })
    if (!antes) throw naoEncontrado('Tipo de ativo não encontrado.')
    await tx.tipoAtivo.delete({ where: { id }, select: selectTipoAtivo })
    await auditar(tx, ctx, {
      acao: 'cadastro.excluido',
      entidade: 'tipo_ativo',
      entidadeId: id,
      dados: { antes },
    })
  })
}
