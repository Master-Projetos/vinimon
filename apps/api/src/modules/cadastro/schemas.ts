import type { Prisma } from '../../generated/prisma/client'

export { cadastroApi } from '@vinimon/shared'

/** Projeção única do módulo: o hash do token nunca sai da API. */
export const selectCadastro = {
  id: true,
  login: true,
  nome: true,
  email: true,
  departamentoId: true,
  confirmadoEm: true,
  criadoEm: true,
} satisfies Prisma.CadastroPendenteSelect
