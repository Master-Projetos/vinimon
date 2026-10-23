import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { KbdShortcut } from '@/components/display/kbd-shortcut'
import { UserAvatar, type UsuarioAvatar } from '@/components/display/user-avatar'

export interface TopBarProps {
  usuario: UsuarioAvatar | null
}

// Busca e menu do usuário da §6.2. A CommandPalette e o menu completo entram em tarefas posteriores:
// aqui ficam os gatilhos acessíveis, sem ação ainda.
export function TopBar({ usuario }: TopBarProps) {
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

      <button
        type="button"
        aria-label="Pesquisar chamados, artigos, equipamentos e pessoas"
        className="mx-auto flex h-8 w-8 items-center justify-center gap-2 rounded-md border bg-background text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-full sm:max-w-xl sm:justify-start sm:px-3"
      >
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="hidden truncate sm:inline">Pesquisar chamados, artigos, equipamentos e pessoas</span>
        <span className="hidden sm:ml-auto sm:inline-flex" aria-hidden="true">
          <KbdShortcut teclas={['mod', 'K']} />
        </span>
      </button>

      <div className="ml-auto flex shrink-0 items-center">
        {usuario ? (
          <Link
            to="/perfil"
            aria-label={`Meu perfil, ${usuario.nome}`}
            className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <UserAvatar usuario={usuario} tamanho="sm" />
          </Link>
        ) : null}
      </div>
    </header>
  )
}
