import type { Prisma } from '../../generated/prisma/client'

export { statusApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectStatus = {
  id: true,
  nome: true,
  tipo: true,
  papel: true,
  cor: true,
  pausaSla: true,
  ignorado: true,
  ordem: true,
  ativo: true,
} satisfies Prisma.StatusSelect
