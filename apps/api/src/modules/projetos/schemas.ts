import type { Prisma } from '../../generated/prisma/client'

export { projetosApi } from '@vinimon/shared'

/** Projeção do projeto (nunca devolva a linha inteira). */
export const selectProjeto = {
  id: true,
  nome: true,
  descricao: true,
  chamadoRaizId: true,
  criadoEm: true,
} satisfies Prisma.ProjetoSelect

/** Projeção de cada chamado da árvore: só o que o contrato expõe. */
export const selectNoChamado = {
  id: true,
  assunto: true,
  statusTipo: true,
  chamadoPaiId: true,
} satisfies Prisma.ChamadoSelect
