import { UserAvatar, type UsuarioAvatar } from './user-avatar'

export interface AvatarGroupProps {
  usuarios: UsuarioAvatar[]
  max?: number
}

export function AvatarGroup({ usuarios, max = 3 }: AvatarGroupProps) {
  const visiveis = usuarios.slice(0, max)
  const restantes = usuarios.length - visiveis.length
  return (
    <ul className="flex items-center -space-x-2">
      {visiveis.map((usuario) => (
        <li key={usuario.id} className="rounded-full ring-2 ring-background">
          <UserAvatar usuario={usuario} tamanho="sm" />
        </li>
      ))}
      {restantes > 0 ? (
        <li className="rounded-full bg-muted px-2 text-xs ring-2 ring-background">
          <span aria-hidden="true">+{restantes}</span>
          <span className="sr-only">e mais {restantes} usuários</span>
        </li>
      ) : null}
    </ul>
  )
}
