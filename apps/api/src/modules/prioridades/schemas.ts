import type { Prisma } from '../../generated/prisma/client'

export { prioridadesApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectPrioridade = {
  id: true,
  nome: true,
  cor: true,
  ordem: true,
  padrao: true,
  slaRespostaMin: true,
  slaSolucaoMin: true,
  ativo: true,
} satisfies Prisma.PrioridadeSelect
