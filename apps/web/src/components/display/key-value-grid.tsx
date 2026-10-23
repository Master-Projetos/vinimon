import type { ReactNode } from 'react'

export interface KeyValueItem {
  rotulo: string
  valor: ReactNode
  dica?: string
}

export interface KeyValueGridProps {
  itens: KeyValueItem[]
  colunas?: 1 | 2 | 3
}

const COLUNAS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
}

export function KeyValueGrid({ itens, colunas = 2 }: KeyValueGridProps) {
  return (
    <dl className={`grid gap-x-6 gap-y-4 ${COLUNAS[colunas]}`}>
      {itens.map((item) => (
        <div key={item.rotulo} className="min-w-0" title={item.dica}>
          <dt className="text-sm text-muted-foreground">{item.rotulo}</dt>
          <dd className="mt-1 text-sm font-medium break-words">{item.valor}</dd>
        </div>
      ))}
    </dl>
  )
}
