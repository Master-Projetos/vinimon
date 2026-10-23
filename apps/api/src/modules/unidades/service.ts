import type { AtualizarUnidade, CriarUnidade, ListarUnidadesQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { selectUnidade } from './schemas'

export async function listarUnidades(q: ListarUnidadesQuery) {
  const where: Prisma.UnidadeWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const [itens, total] = await prisma.$transaction([
    prisma.unidade.findMany({
      where,
      select: selectUnidade,
      orderBy: [{ nome: q.direcao }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.unidade.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterUnidade(id: number) {
  const unidade = await prisma.unidade.findUnique({ where: { id }, select: selectUnidade })
  if (!unidade) throw naoEncontrado('Unidade não encontrada.')
  return unidade
}

/** Nome duplicado → P2002 → 409 (rollback). */
export function criarUnidade(dados: CriarUnidade, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const unidade = await tx.unidade.create({
      data: { nome: dados.nome, endereco: dados.endereco, ativo: dados.ativo },
      select: selectUnidade,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'unidade',
      entidadeId: unidade.id,
      dados: { depois: unidade },
    })
    return unidade
  })
}

export function atualizarUnidade(id: number, dados: AtualizarUnidade, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.unidade.findUnique({ where: { id }, select: selectUnidade })
    if (!antes) throw naoEncontrado('Unidade não encontrada.')
    const depois = await tx.unidade.update({
      where: { id },
      data: { nome: dados.nome, endereco: dados.endereco, ativo: dados.ativo },
      select: selectUnidade,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'unidade',
      entidadeId: id,
      dados: { antes, depois },
    })
    return depois
  })
}

/** Unidade com departamento → P2003 → 409 REGISTRO_EM_USO (rollback, nada é auditado). */
export async function excluirUnidade(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.unidade.delete({ where: { id }, select: selectUnidade })
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'unidade', entidadeId: id, dados: { antes } })
  })
}
