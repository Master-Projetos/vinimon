import type { Prisma } from '../../generated/prisma/client'

export { assentamentosApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectAssentamento = {
  id: true,
  chamadoId: true,
  tipo: true,
  interno: true,
  texto: true,
  evento: true,
  dados: true,
  clienteId: true,
  criadoEm: true,
  autor: { select: { id: true, nome: true } },
} satisfies Prisma.AssentamentoSelect
