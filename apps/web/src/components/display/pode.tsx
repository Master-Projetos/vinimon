import { type Perfil, type Permissao, temPermissao } from '@vinimon/shared'
import type { ReactNode } from 'react'

export interface PodeProps {
  // O perfil vem por prop: a ligação com a sessão (route context da T-9.7) fica para os chamadores.
  perfil: Perfil
  permissao: Permissao
  children: ReactNode
  senao?: ReactNode
}

// A interface só esconde; quem garante a permissão é a API.
export function Pode({ perfil, permissao, children, senao = null }: PodeProps) {
  return temPermissao(perfil, permissao) ? children : senao
}
