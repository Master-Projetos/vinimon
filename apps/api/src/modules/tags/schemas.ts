import type { Prisma } from '../../generated/prisma/client'

export { tagsApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectTag = {
  id: true,
  nome: true,
  ativo: true,
  criadoEm: true,
} satisfies Prisma.TagSelect
