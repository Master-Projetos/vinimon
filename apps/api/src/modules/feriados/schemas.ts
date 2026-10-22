import type { Prisma } from '../../generated/prisma/client'

export { feriadosApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectFeriado = {
  id: true,
  data: true,
  nome: true,
  recorrente: true,
  jornadaId: true,
  criadoEm: true,
} satisfies Prisma.FeriadoSelect
