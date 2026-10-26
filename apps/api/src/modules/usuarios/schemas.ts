import type { Prisma } from '../../generated/prisma/client'

export { usuariosApi } from '@vinimon/shared'

/** Projeção única do módulo: nunca expõe hash de senha, segredo de 2FA nem buscaNorm. */
export const selectUsuario = {
  id: true,
  login: true,
  nome: true,
  email: true,
  telefone: true,
  perfil: true,
  areaId: true,
  departamentoId: true,
  ativo: true,
  deveTrocarSenha: true,
  mfaAtivadoEm: true,
  ultimoLoginEm: true,
  criadoEm: true,
  atualizadoEm: true,
  area: { select: { id: true, nome: true } },
  areasSecundarias: { select: { areaId: true }, orderBy: { areaId: 'asc' } },
  areasGeridas: { select: { areaId: true }, orderBy: { areaId: 'asc' } },
} satisfies Prisma.UsuarioSelect

export const selectUsuarioBusca = {
  id: true,
  nome: true,
  login: true,
  area: { select: { nome: true } },
} satisfies Prisma.UsuarioSelect
