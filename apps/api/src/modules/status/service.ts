import { type AtualizarStatus, type CriarStatus, type ListarStatusQuery, regrasDoStatus } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { ErroApp, naoEncontrado, regraNegocio } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { selectStatus } from './schemas'

export async function listarStatus(q: ListarStatusQuery) {
  const where: Prisma.StatusWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const [itens, total] = await prisma.$transaction([
    prisma.status.findMany({
      where,
      select: selectStatus,
      orderBy: [{ ordem: 'asc' }, { nome: q.direcao }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.status.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterStatus(id: number) {
  const status = await prisma.status.findUnique({ where: { id }, select: selectStatus })
  if (!status) throw naoEncontrado('Status não encontrado.')
  return status
}

/** Papel duplicado ou nome duplicado → P2002 → 409 (rollback). Regras papel × tipo → 400 pelo Zod. */
export function criarStatus(dados: CriarStatus, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const status = await tx.status.create({ data: { ...dados }, select: selectStatus })
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'status',
      entidadeId: status.id,
      dados: { depois: status },
    })
    return status
  })
}

/**
 * Regras da atualização:
 * - estado final (campos novos + gravados) precisa respeitar papel × tipo × pausaSla → 400;
 * - mudar `tipo` de status usado por chamado → 422;
 * - status com papel não pode ser inativado → 422;
 * - papel duplicado → P2002 → 409.
 */
export function atualizarStatus(id: number, dados: AtualizarStatus, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.status.findUnique({ where: { id }, select: selectStatus })
    if (!antes) throw naoEncontrado('Status não encontrado.')

    const detalhes = regrasDoStatus({
      tipo: dados.tipo ?? antes.tipo,
      papel: dados.papel !== undefined ? dados.papel : antes.papel,
      pausaSla: dados.pausaSla ?? antes.pausaSla,
    })
    if (detalhes.length > 0) throw new ErroApp(400, 'VALIDACAO', 'Os dados do status são inválidos.', detalhes)

    if (dados.tipo !== undefined && dados.tipo !== antes.tipo) {
      const emUso = await tx.chamado.count({ where: { statusId: id } })
      if (emUso > 0) throw regraNegocio('Status em uso: o tipo não pode mudar.')
    }
    if (antes.papel !== null && dados.ativo === false) {
      throw regraNegocio('Status com papel não pode ser inativado.')
    }

    const depois = await tx.status.update({ where: { id }, data: { ...dados }, select: selectStatus })
    await auditar(tx, ctx, { acao: 'cadastro.alterado', entidade: 'status', entidadeId: id, dados: { antes, depois } })
    return depois
  })
}

/** Status com papel não pode ser excluído → 422. Status em uso → P2003 → 409 (rollback). */
export async function excluirStatus(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.status.findUnique({ where: { id }, select: selectStatus })
    if (!antes) throw naoEncontrado('Status não encontrado.')
    if (antes.papel !== null) throw regraNegocio('Status com papel não pode ser excluído.')
    await tx.status.delete({ where: { id }, select: selectStatus })
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'status', entidadeId: id, dados: { antes } })
  })
}
