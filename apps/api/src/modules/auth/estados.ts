import { type EstadoSessao, exigeMfa, type Perfil } from '@vinimon/shared'

interface EstadoUsuario {
  perfil: Perfil
  deveTrocarSenha: boolean
  mfaAtivadoEm: Date | null
}

/** Ordem obrigatória (S26): PENDENTE_MFA → TROCA_SENHA → CADASTRO_MFA → ATIVA. */
export function estadoAposSenha(u: EstadoUsuario): EstadoSessao {
  if (u.mfaAtivadoEm) return 'PENDENTE_MFA'
  return estadoAposMfa(u)
}
export function estadoAposMfa(u: EstadoUsuario): EstadoSessao {
  if (u.deveTrocarSenha) return 'TROCA_SENHA'
  return estadoAposTrocaSenha(u)
}
export function estadoAposTrocaSenha(u: EstadoUsuario): EstadoSessao {
  if (exigeMfa(u.perfil) && !u.mfaAtivadoEm) return 'CADASTRO_MFA'
  return 'ATIVA'
}
