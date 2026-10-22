import type { Prisma } from '../../generated/prisma/client'

export { unidadesApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectUnidade = {
  id: true,
  nome: true,
  endereco: true,
  ativo: true,
  criadoEm: true,
  atualizadoEm: true,
} satisfies Prisma.UnidadeSelect
