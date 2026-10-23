import { Link, type LinkProps } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RouteTabItem {
  to: LinkProps['to']
  params?: LinkProps['params']
  search?: true
  rotulo: string
  icone?: LucideIcon
  contagem?: number
  exact?: boolean
}

export interface RouteTabsProps {
  itens: RouteTabItem[]
  rotulo: string
}

/**
 * Abas por rota (§6.2). São links de navegação, então usam `nav` com `aria-current="page"` (o Link
 * põe o atributo na aba ativa), e não `role="tablist"`, que pede painéis controlados na mesma página.
 */
export function RouteTabs({ itens, rotulo }: RouteTabsProps) {
  return (
    <nav aria-label={rotulo} className="-mb-px overflow-x-auto">
      <ul className="flex min-w-max gap-1">
        {itens.map((item) => {
          const Icone = item.icone
          return (
            <li key={`${String(item.to)}-${item.rotulo}`}>
              <Link
                to={item.to}
                params={item.params}
                search={item.search ? true : undefined}
                activeOptions={{ exact: item.exact ?? false }}
                className={cn(
                  'inline-flex h-10 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                )}
                activeProps={{ className: 'border-primary font-semibold text-foreground' }}
              >
                {Icone ? <Icone aria-hidden="true" className="size-4" /> : null}
                {item.rotulo}
                {item.contagem !== undefined && item.contagem > 0 ? (
                  <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
                    {item.contagem}
                    <span className="sr-only"> itens</span>
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
