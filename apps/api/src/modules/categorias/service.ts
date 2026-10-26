import type { AtualizarCategoria, CriarCategoria, ListarCategoriasQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'

/** Projeção única do módulo (nunca devolva a linha inteira). */
const selectCategoria = { id: true, grupo: true, nome: true, ativo: true } satisfies Prisma.CategoriaSelect

export async function listarCategorias(q: ListarCategoriasQuery) {
  const where: Prisma.CategoriaWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.grupo === undefined ? {} : { grupo: q.grupo }),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const [itens, total] = await prisma.$transaction([
    prisma.categoria.findMany({
      where,
      select: selectCategoria,
      orderBy: [{ grupo: 'asc' }, { nome: 'asc' }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.categoria.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterCategoria(id: number) {
  const categoria = await prisma.categoria.findUnique({ where: { id }, select: selectCategoria })
  if (!categoria) throw naoEncontrado('Categoria não encontrada.')
  return categoria
}

/** Mesmo nome no mesmo grupo → P2002 → 409. */
export function criarCategoria(dados: CriarCategoria, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const categoria = await tx.categoria.create({
      data: { grupo: dados.grupo, nome: dados.nome, ativo: dados.ativo },
      select: selectCategoria,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'categoria',
      entidadeId: categoria.id,
      dados: { depois: categoria },
    })
    return categoria
  })
}

export function atualizarCategoria(id: number, dados: AtualizarCategoria, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.categoria.findUnique({ where: { id }, select: selectCategoria })
    if (!antes) throw naoEncontrado('Categoria não encontrada.')
    const depois = await tx.categoria.update({
      where: { id },
      data: { nome: dados.nome, ativo: dados.ativo },
      select: selectCategoria,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'categoria',
      entidadeId: id,
      dados: { antes, depois },
    })
    return depois
  })
}

/** Categoria em uso por problema → P2003 → 409 REGISTRO_EM_USO (rollback, nada é auditado). */
export async function excluirCategoria(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.categoria.delete({ where: { id }, select: selectCategoria })
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'categoria', entidadeId: id, dados: { antes } })
  })
}
