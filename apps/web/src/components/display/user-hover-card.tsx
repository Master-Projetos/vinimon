import type { ReactNode } from 'react'
import { PresenceIndicator } from '@/components/display/presence-indicator'
import { UserAvatar, type UsuarioAvatar } from '@/components/display/user-avatar'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { usePresenca } from '@/features/presenca/hooks'

export interface UserHoverCardProps {
  usuario: UsuarioAvatar & { perfil?: string; email?: string | null }
  children: ReactNode
}

/** Cartão de perfil ao passar o mouse ou focar uma pessoa: avatar, nome, presença e contato. */
export function UserHoverCard({ usuario, children }: UserHoverCardProps) {
  const presencas = usePresenca([usuario.id])
  return (
    <HoverCard>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-64">
        <div className="flex items-center gap-3">
          <UserAvatar usuario={usuario} />
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate text-sm font-medium">
              {usuario.nome} <PresenceIndicator status={presencas[usuario.id] ?? 'OFFLINE'} />
            </p>
            {usuario.perfil ? <p className="truncate text-xs text-muted-foreground">{usuario.perfil}</p> : null}
            {usuario.email ? <p className="truncate text-xs text-muted-foreground">{usuario.email}</p> : null}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
