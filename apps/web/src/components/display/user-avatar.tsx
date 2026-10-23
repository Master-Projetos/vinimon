import { coresDeBadge, type ModoTema } from '@/lib/cores'

// Cores da §6.1: a cor do avatar sem foto é escolhida por `id % 8`.
const CORES_AVATAR = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#7c3aed', '#475569'] as const

export interface UsuarioAvatar {
  id: number
  nome: string
}

export interface UserAvatarProps {
  usuario: UsuarioAvatar
  tamanho?: 'sm' | 'md'
  modo?: ModoTema
}

export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const primeira = partes.at(0)?.charAt(0) ?? ''
  const ultima = partes.length > 1 ? (partes.at(-1)?.charAt(0) ?? '') : ''
  return `${primeira}${ultima}`.toLocaleUpperCase('pt-BR')
}

export function corDoAvatar(id: number): string {
  const indice = ((id % CORES_AVATAR.length) + CORES_AVATAR.length) % CORES_AVATAR.length
  return CORES_AVATAR[indice] ?? CORES_AVATAR[0]
}

export function UserAvatar({ usuario, tamanho = 'md', modo = 'claro' }: UserAvatarProps) {
  const cores = coresDeBadge(corDoAvatar(usuario.id), modo)
  const dimensao = tamanho === 'sm' ? 'size-6 text-xs' : 'size-8 text-sm'
  return (
    <span
      role="img"
      aria-label={usuario.nome}
      className={`inline-flex items-center justify-center rounded-full font-medium select-none ${dimensao}`}
      style={{ backgroundColor: cores.fundo, color: cores.texto, borderColor: cores.borda }}
    >
      <span aria-hidden="true">{iniciaisDe(usuario.nome)}</span>
    </span>
  )
}
