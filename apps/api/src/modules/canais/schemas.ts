import type { Prisma } from '../../generated/prisma/client'

export { canaisApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectCanal = {
  id: true,
  nome: true,
  sistema: true,
  ativo: true,
} satisfies Prisma.CanalSelect
