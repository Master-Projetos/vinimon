import type { Prisma } from '../../generated/prisma/client'

export { jornadasApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectJornada = {
  id: true,
  nome: true,
  timezone: true,
  ininterrupta: true,
  ativo: true,
  horarios: {
    select: { diaSemana: true, inicioMin: true, fimMin: true },
    orderBy: [{ diaSemana: 'asc' }, { inicioMin: 'asc' }],
  },
  criadoEm: true,
  atualizadoEm: true,
} satisfies Prisma.JornadaSelect
