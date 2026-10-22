import type { Prisma } from '../../generated/prisma/client'

export { categoriasArtigoApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectCategoriaArtigo = {
  id: true,
  nome: true,
  ordem: true,
  ativo: true,
} satisfies Prisma.CategoriaArtigoSelect
