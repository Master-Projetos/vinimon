import type { ReactNode } from 'react'

export type TomStat = 'neutro' | 'info' | 'sucesso' | 'alerta' | 'perigo'

export interface StatCardProps {
  titulo: string
  valor: number | string
  // Ícone já pronto (ex.: um SVG). Não há lucide-react no projeto, então o ícone entra como ReactNode.
  icone?: ReactNode
  tom?: TomStat
  descricao?: string
  carregando?: boolean
}

const TOM: Record<TomStat, string> = {
  neutro: 'text-foreground',
  info: 'text-sky-700 dark:text-sky-300',
  sucesso: 'text-emerald-700 dark:text-emerald-300',
  alerta: 'text-amber-700 dark:text-amber-300',
  perigo: 'text-red-700 dark:text-red-300',
}

export function StatCard({ titulo, valor, icone, tom = 'neutro', descricao, carregando = false }: StatCardProps) {
  return (
    <section aria-busy={carregando} className="rounded-lg border bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm text-muted-foreground">{titulo}</h3>
        {icone ? (
          <span aria-hidden="true" className={TOM[tom]}>
            {icone}
          </span>
        ) : null}
      </header>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${TOM[tom]}`}>
        {carregando ? <span className="sr-only">Carregando</span> : valor}
      </p>
      {descricao ? <p className="mt-1 text-xs text-muted-foreground">{descricao}</p> : null}
    </section>
  )
}
