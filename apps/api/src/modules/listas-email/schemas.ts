import type { Prisma } from '../../generated/prisma/client'

export { listasEmailApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectListaEmail = {
  id: true,
  nome: true,
  emails: true,
  criadoEm: true,
  atualizadoEm: true,
} satisfies Prisma.ListaEmailSelect
