import type { ReactNode } from 'react'
import { PresenceIndicator } from '@/components/display/presence-indicator'
import { UserAvatar, type UsuarioAvatar } from '@/components/display/user-avatar'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { usePresenca } from '@/features/presenca/hooks'

export interface UserHoverCardProps {
  usuario: UsuarioAvatar
  /** Nome da área, quando o contrato da tela já o devolve (ex.: `Usuario.area.nome`). */
  area?: string | null
  /** Avatar ou nome que abre o cartão (passar o mouse ou focar). */
  children: ReactNode
}

// S97: só nome, área e presença `{usuarioId, estado}`. Nada de IP, horário, e-mail, telefone ou login.
// O conteúdo (e com ele a assinatura de presença) só existe enquanto o cartão está aberto.
function CartaoDoUsuario({ usuario, area }: { usuario: UsuarioAvatar; area?: string | null }) {
  const presenca = usePresenca([usuario.id])
  return (
    <div className="flex items-center gap-3">
      <UserAvatar usuario={usuario} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{usuario.nome}</p>
        {area ? <p className="truncate text-xs text-muted-foreground">{area}</p> : null}
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <PresenceIndicator status={presenca[usuario.id] ?? 'OFFLINE'} />
        </p>
      </div>
    </div>
  )
}

export function UserHoverCard({ usuario, area, children }: UserHoverCardProps) {
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {children}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" aria-label={`Perfil de ${usuario.nome}`}>
        <CartaoDoUsuario usuario={usuario} area={area} />
      </HoverCardContent>
    </HoverCard>
  )
}
