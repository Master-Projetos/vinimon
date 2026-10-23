import type { LucideIcon } from 'lucide-react'
import { Slot } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ListPaneNavItemProps {
  /**
   * Com `asChild`, `children` é o elemento que recebe as classes e o `aria-current` (ex.: um Link) e
   * contém o próprio conteúdo. Sem ele, o item monta o rótulo, o ícone, a contagem e o ponto de não lido.
   */
  asChild?: boolean
  ativo?: boolean
  icone?: LucideIcon
  rotulo: string
  contagem?: number
  naoLido?: boolean
  acoes?: ReactNode
  children?: ReactNode
}

const CLASSES_ITEM =
  'group relative flex min-h-9 w-full items-center gap-2 rounded-md px-3 py-(--item-py) text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

/** Item do painel de lista (§2.5). Ativo: cartão branco com anel; não lido: título em negrito e ponto `bg-primary`. */
export function ListPaneNavItem({
  asChild = false,
  ativo = false,
  icone: Icone,
  rotulo,
  contagem,
  naoLido = false,
  acoes,
  children,
}: ListPaneNavItemProps) {
  const classes = cn(CLASSES_ITEM, ativo && 'bg-background shadow-xs ring-1 ring-border')
  const ariaCurrent = ativo ? 'page' : undefined

  if (asChild) {
    return (
      <Slot.Root className={classes} aria-current={ariaCurrent}>
        {children}
      </Slot.Root>
    )
  }

  return (
    <div className={classes} aria-current={ariaCurrent}>
      {Icone ? <Icone aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /> : null}
      <span className={cn('min-w-0 flex-1 truncate', naoLido && 'font-semibold')}>{rotulo}</span>
      {naoLido ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" /> : null}
      {contagem !== undefined && contagem > 0 ? (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {contagem}
          <span className="sr-only"> itens</span>
        </span>
      ) : null}
      {acoes ? <span className="flex shrink-0 items-center">{acoes}</span> : null}
      {children}
    </div>
  )
}
