import type { AtualizarArea, CriarArea, ListarAreasQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { selectArea } from './schemas'

export async function listarAreas(q: ListarAreasQuery) {
  const where: Prisma.AreaWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const ordem: Record<ListarAreasQuery['ordem'], Prisma.AreaOrderByWithRelationInput> = {
    nome: { nome: q.direcao },
    criadoEm: { criadoEm: q.direcao },
  }
  const [itens, total] = await prisma.$transaction([
    prisma.area.findMany({ where, select: selectArea, orderBy: [ordem[q.ordem], { id: 'asc' }], ...paginar(q) }),
    prisma.area.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterArea(id: number) {
  const area = await prisma.area.findUnique({ where: { id }, select: selectArea })
  if (!area) throw naoEncontrado('Área não encontrada.')
  return area
}

/** Nome duplicado → P2002 → 409; jornadaId inexistente → P2003 → 422. */
export function criarArea(dados: CriarArea, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const area = await tx.area.create({
      data: { nome: dados.nome, atende: dados.atende, ativo: dados.ativo, jornadaId: dados.jornadaId },
      select: selectArea,
    })
    await auditar(tx, ctx, { acao: 'cadastro.criado', entidade: 'area', entidadeId: area.id, dados: { depois: area } })
    return area
  })
}

export function atualizarArea(id: number, dados: AtualizarArea, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.area.findUnique({ where: { id }, select: selectArea })
    if (!antes) throw naoEncontrado('Área não encontrada.')
    const depois = await tx.area.update({
      where: { id },
      data: { nome: dados.nome, atende: dados.atende, ativo: dados.ativo, jornadaId: dados.jornadaId },
      select: selectArea,
    })
    await auditar(tx, ctx, { acao: 'cadastro.alterado', entidade: 'area', entidadeId: id, dados: { antes, depois } })
    return depois
  })
}

/** Área em uso → P2003 → 409 REGISTRO_EM_USO (rollback, nada é auditado). */
export async function excluirArea(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.area.delete({ where: { id }, select: selectArea })
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'area', entidadeId: id, dados: { antes } })
  })
}
