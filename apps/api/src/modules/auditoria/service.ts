import type { ListarAuditoriaQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { type DetalheErro, ErroApp } from '../../lib/erros'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'

const DIA_MS = 86_400_000
const DIAS_PADRAO = 30
const DIAS_MAXIMO = 366

/** Projeção única da trilha (nunca devolva a linha inteira). */
export const selectAuditoria = {
  id: true,
  criadoEm: true,
  atorTipo: true,
  ator: { select: { id: true, nome: true } },
  acao: true,
  entidade: true,
  entidadeId: true,
  ip: true,
  userAgent: true,
  requestId: true,
  dados: true,
} satisfies Prisma.AuditoriaSelect

/** Período da consulta: padrão de 30 dias até agora; no máximo 366 dias (S58). */
export function resolverPeriodo(q: Pick<ListarAuditoriaQuery, 'de' | 'ate'>, agora: Date = new Date()) {
  const ate = q.ate ?? agora
  const de = q.de ?? new Date(ate.getTime() - DIAS_PADRAO * DIA_MS)
  const problemas: DetalheErro[] = []
  if (de.getTime() > ate.getTime()) {
    problemas.push({ campo: 'de', mensagem: 'A data inicial deve ser anterior ou igual à final.' })
  } else if (ate.getTime() - de.getTime() > DIAS_MAXIMO * DIA_MS) {
    problemas.push({ campo: 'de', mensagem: `O período deve ter no máximo ${DIAS_MAXIMO} dias.` })
  }
  if (problemas.length > 0) throw new ErroApp(400, 'VALIDACAO', 'Período de consulta inválido.', problemas)
  return { de, ate }
}

export async function listarAuditoria(q: ListarAuditoriaQuery) {
  const { de, ate } = resolverPeriodo(q)
  const where: Prisma.AuditoriaWhereInput = {
    criadoEm: { gte: de, lte: ate },
    ...(q.atorId === undefined ? {} : { atorId: q.atorId }),
    ...(q.acao ? { acao: q.acao } : {}),
    ...(q.entidade ? { entidade: q.entidade } : {}),
    ...(q.entidadeId ? { entidadeId: q.entidadeId } : {}),
  }
  const [itens, total] = await prisma.$transaction([
    prisma.auditoria.findMany({
      where,
      select: selectAuditoria,
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      ...paginar(q),
    }),
    prisma.auditoria.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}
