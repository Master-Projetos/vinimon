import type * as React from 'react'
import { Button } from '@/components/ui/button'

export interface DataTableBulkBarProps {
  quantidade: number
  aoLimpar: () => void
  children: React.ReactNode
}

/** Barra de ações em massa. A região `aria-live` fica sempre no DOM para anunciar a contagem. */
export function DataTableBulkBar({ quantidade, aoLimpar, children }: DataTableBulkBarProps) {
  return (
    <div aria-live="polite">
      {quantidade > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">
            {quantidade} {quantidade === 1 ? 'selecionado' : 'selecionados'}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={aoLimpar}>
            Limpar seleção
          </Button>
          {children}
        </div>
      ) : null}
    </div>
  )
}
