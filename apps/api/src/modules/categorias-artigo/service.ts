import type { AtualizarCategoriaArtigo, CriarCategoriaArtigo, ListarCategoriasArtigoQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { selectCategoriaArtigo } from './schemas'

export async function listarCategoriasArtigo(q: ListarCategoriasArtigoQuery) {
  const where: Prisma.CategoriaArtigoWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const [itens, total] = await prisma.$transaction([
    prisma.categoriaArtigo.findMany({
      where,
      select: selectCategoriaArtigo,
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.categoriaArtigo.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterCategoriaArtigo(id: number) {
  const categoria = await prisma.categoriaArtigo.findUnique({ where: { id }, select: selectCategoriaArtigo })
  if (!categoria) throw naoEncontrado('Categoria de artigo não encontrada.')
  return categoria
}

/** Nome duplicado → P2002 → 409 (rollback). */
export function criarCategoriaArtigo(dados: CriarCategoriaArtigo, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const categoria = await tx.categoriaArtigo.create({
      data: { nome: dados.nome, ordem: dados.ordem, ativo: dados.ativo },
      select: selectCategoriaArtigo,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'categoria_artigo',
      entidadeId: categoria.id,
      dados: { depois: categoria },
    })
    return categoria
  })
}

export function atualizarCategoriaArtigo(id: number, dados: AtualizarCategoriaArtigo, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.categoriaArtigo.findUnique({ where: { id }, select: selectCategoriaArtigo })
    if (!antes) throw naoEncontrado('Categoria de artigo não encontrada.')
    const depois = await tx.categoriaArtigo.update({
      where: { id },
      data: { nome: dados.nome, ordem: dados.ordem, ativo: dados.ativo },
      select: selectCategoriaArtigo,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'categoria_artigo',
      entidadeId: id,
      dados: { antes, depois },
    })
    return depois
  })
}

/** Categoria com artigo → P2003 → 409 REGISTRO_EM_USO (rollback, nada é auditado). */
export async function excluirCategoriaArtigo(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.categoriaArtigo.delete({ where: { id }, select: selectCategoriaArtigo })
    await auditar(tx, ctx, {
      acao: 'cadastro.excluido',
      entidade: 'categoria_artigo',
      entidadeId: id,
      dados: { antes },
    })
  })
}
