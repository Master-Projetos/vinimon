import type { AtualizarDepartamento, CriarDepartamento, ListarDepartamentosQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { selectDepartamento } from './schemas'

export async function listarDepartamentos(q: ListarDepartamentosQuery) {
  const where: Prisma.DepartamentoWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
    ...(q.unidadeId === undefined ? {} : { unidadeId: q.unidadeId }),
  }
  const [itens, total] = await prisma.$transaction([
    prisma.departamento.findMany({
      where,
      select: selectDepartamento,
      orderBy: [{ nome: q.direcao }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.departamento.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterDepartamento(id: number) {
  const departamento = await prisma.departamento.findUnique({ where: { id }, select: selectDepartamento })
  if (!departamento) throw naoEncontrado('Departamento não encontrado.')
  return departamento
}

/** Nome repetido na mesma unidade → P2002 → 409; unidade inexistente → P2003 → 422. */
export function criarDepartamento(dados: CriarDepartamento, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const departamento = await tx.departamento.create({
      data: { unidadeId: dados.unidadeId, nome: dados.nome, ativo: dados.ativo },
      select: selectDepartamento,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'departamento',
      entidadeId: departamento.id,
      dados: { depois: departamento },
    })
    return departamento
  })
}

export function atualizarDepartamento(id: number, dados: AtualizarDepartamento, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.departamento.findUnique({ where: { id }, select: selectDepartamento })
    if (!antes) throw naoEncontrado('Departamento não encontrado.')
    const depois = await tx.departamento.update({
      where: { id },
      data: { unidadeId: dados.unidadeId, nome: dados.nome, ativo: dados.ativo },
      select: selectDepartamento,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'departamento',
      entidadeId: id,
      dados: { antes, depois },
    })
    return depois
  })
}

/** Departamento com usuário, chamado ou ativo → P2003 → 409 REGISTRO_EM_USO (rollback, nada é auditado). */
export async function excluirDepartamento(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.departamento.delete({ where: { id }, select: selectDepartamento })
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'departamento', entidadeId: id, dados: { antes } })
  })
}
