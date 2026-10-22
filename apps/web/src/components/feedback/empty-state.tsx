import type { LucideIcon } from 'lucide-react'
import type React from 'react'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icone: LucideIcon
  titulo: string
  descricao?: React.ReactNode
  acao?: React.ReactNode
  compacto?: boolean
}

export function EmptyState({ icone: Icone, titulo, descricao, acao, compacto = false }: EmptyStateProps) {
  return (
    <Empty className={cn(compacto && 'gap-3 p-4 md:p-4')}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icone aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{titulo}</EmptyTitle>
        {descricao ? <EmptyDescription>{descricao}</EmptyDescription> : null}
      </EmptyHeader>
      {acao ? <EmptyContent>{acao}</EmptyContent> : null}
    </Empty>
  )
}
