import { useRouterState } from '@tanstack/react-router'
import { LifeBuoy } from 'lucide-react'
import { AppBarItem, type AppBarItemDef, estaAtivo } from './app-bar-item'

export interface AppBarProps {
  itens: AppBarItemDef[]
  aoAbrirAjuda: () => void
}

// Trilho vertical à esquerda, só a partir de md (768 px). Abaixo disso, a MobileNav assume.
export function AppBar({ itens, aoAbrirAjuda }: AppBarProps) {
  const pathname = useRouterState({ select: (estado) => estado.location.pathname })

  return (
    <nav
      aria-label="Aplicativos"
      className="hidden min-h-0 flex-col items-center overflow-y-auto bg-frame py-2 md:flex"
    >
      <ul className="flex w-full flex-col gap-1 px-1">
        {itens.map((item) => (
          <li key={item.id}>
            <AppBarItem item={item} ativo={estaAtivo(pathname, item.to)} />
          </li>
        ))}
      </ul>
      <div className="mt-auto flex w-full px-1 pt-2">
        <button
          type="button"
          aria-label="Ajuda e atalhos de teclado"
          onClick={aoAbrirAjuda}
          className="flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-md text-frame-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <LifeBuoy aria-hidden="true" className="size-6" />
          <span className="text-appbar">Ajuda</span>
        </button>
      </div>
    </nav>
  )
}
