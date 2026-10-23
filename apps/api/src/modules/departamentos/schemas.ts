import type { Prisma } from '../../generated/prisma/client'

export { departamentosApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectDepartamento = {
  id: true,
  unidadeId: true,
  nome: true,
  ativo: true,
  criadoEm: true,
  atualizadoEm: true,
  unidade: { select: { id: true, nome: true } },
} satisfies Prisma.DepartamentoSelect
