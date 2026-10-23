import { Link } from '@tanstack/react-router'
import type { UsuarioAvatar } from '@/components/display/user-avatar'
import { NotificationBell } from '@/features/notificacoes/components/notification-bell'
import { UserMenu } from '@/features/presenca/components/user-menu'
import { BuscaGlobalTrigger } from './busca-global-trigger'

export interface TopBarProps {
  usuario: UsuarioAvatar | null
  aoAbrirBusca?: () => void
  aoAbrirAtalhos?: () => void
}

// Busca e menu do usuário da §6.2. A paleta e o diálogo de atalhos moram no AppShell.
export function TopBar({ usuario, aoAbrirBusca = () => undefined, aoAbrirAtalhos }: TopBarProps) {
  return (
    <header className="flex h-(--topbar-h) items-center gap-3 bg-frame px-3 text-frame-foreground md:col-span-2">
      <Link
        to="/"
        aria-label="Vinimon, início"
        className="flex shrink-0 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
        >
          V
        </span>
        <span className="hidden text-sm font-semibold text-foreground lg:inline">Vinimon</span>
      </Link>

      <BuscaGlobalTrigger aoAbrir={aoAbrirBusca} />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {usuario ? <NotificationBell /> : null}
        {usuario ? <UserMenu usuario={usuario} {...(aoAbrirAtalhos ? { aoAbrirAtalhos } : {})} /> : null}
      </div>
    </header>
  )
}
