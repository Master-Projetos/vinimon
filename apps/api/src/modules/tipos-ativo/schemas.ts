import type { Prisma } from '../../generated/prisma/client'

export { tiposAtivoApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectTipoAtivo = {
  id: true,
  nome: true,
  ativo: true,
} satisfies Prisma.TipoAtivoSelect
