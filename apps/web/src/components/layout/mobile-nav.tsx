import { Link, useRouterState } from '@tanstack/react-router'
import { CircleUser, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AppBarItem, type AppBarItemDef, classesDoItem, estaAtivo } from './app-bar-item'

export interface MobileNavProps {
  itens: AppBarItemDef[]
}

// Abaixo de 768 px: os quatro primeiros itens e "Mais" (§6.2). Some a partir de md.
export function MobileNav({ itens }: MobileNavProps) {
  const [maisAberto, setMaisAberto] = useState(false)
  const pathname = useRouterState({ select: (estado) => estado.location.pathname })
  const principais = itens.slice(0, 4)
  const restantes = itens.slice(4)
  const maisAtivo = pathname === '/perfil' || restantes.some((item) => estaAtivo(pathname, item.to))

  return (
    <nav
      aria-label="Navegação principal"
      className="row-start-3 flex h-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom))] flex-col border-t bg-frame pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid h-(--bottomnav-h) grid-cols-5 gap-1 px-1">
        {principais.map((item) => (
          <li key={item.id} className="flex">
            <AppBarItem item={item} ativo={estaAtivo(pathname, item.to)} />
          </li>
        ))}
        <li className="flex">
          <Sheet open={maisAberto} onOpenChange={setMaisAberto}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={maisAberto}
                className={classesDoItem(maisAtivo)}
              >
                <MoreHorizontal aria-hidden="true" className="size-6" />
                <span className="text-appbar">Mais</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80dvh]">
              <SheetHeader>
                <SheetTitle>Mais</SheetTitle>
                <SheetDescription>Outras áreas do Vinimon</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mais opções" className="px-4 pb-4">
                <ul className="flex flex-col gap-1">
                  {restantes.map((item) => (
                    <li key={item.id}>
                      <Link
                        to={item.to}
                        onClick={() => setMaisAberto(false)}
                        aria-current={estaAtivo(pathname, item.to) ? 'page' : undefined}
                        className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-accent"
                      >
                        <item.icone aria-hidden="true" className="size-5" />
                        {item.rotuloAcessivel}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      to="/perfil"
                      onClick={() => setMaisAberto(false)}
                      aria-current={pathname === '/perfil' ? 'page' : undefined}
                      className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-accent"
                    >
                      <CircleUser aria-hidden="true" className="size-5" />
                      Meu perfil
                    </Link>
                  </li>
                </ul>
              </nav>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  )
}
