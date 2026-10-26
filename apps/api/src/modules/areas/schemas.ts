import type { Prisma } from '../../generated/prisma/client'

export { areasApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectArea = {
  id: true,
  nome: true,
  atende: true,
  ativo: true,
  moduloInventario: true,
  jornadaId: true,
  criadoEm: true,
  atualizadoEm: true,
} satisfies Prisma.AreaSelect
