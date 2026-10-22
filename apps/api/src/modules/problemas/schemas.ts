import type { Prisma } from '../../generated/prisma/client'

export { problemasApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectProblema = {
  id: true,
  nome: true,
  descricao: true,
  areaPadraoId: true,
  slaRespostaMin: true,
  slaSolucaoMin: true,
  ativo: true,
  areas: { select: { area: { select: { id: true, nome: true } } }, orderBy: { areaId: 'asc' } },
} satisfies Prisma.ProblemaSelect
