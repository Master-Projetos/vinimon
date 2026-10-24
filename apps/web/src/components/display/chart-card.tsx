import { type ReactNode, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface ChartCardProps {
  titulo: string
  /** Cabeçalhos da versão em tabela. */
  colunas: readonly string[]
  /** Linhas da versão em tabela, na mesma ordem das colunas. */
  linhas: readonly (readonly (string | number)[])[]
  /** O gráfico. */
  children: ReactNode
}

/** Cartão de gráfico com o alternador "Ver como tabela" (os mesmos dados em `<table>`). */
export function ChartCard({ titulo, colunas, linhas, children }: ChartCardProps) {
  const [tabela, setTabela] = useState(false)
  const id = useId()
  return (
    <section aria-labelledby={id} className="rounded-lg border bg-card p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 id={id} className="text-sm font-medium">
          {titulo}
        </h2>
        <Button variant="ghost" size="sm" aria-pressed={tabela} onClick={() => setTabela((v) => !v)}>
          {tabela ? 'Ver como gráfico' : 'Ver como tabela'}
        </Button>
      </header>
      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados no período.</p>
      ) : tabela ? (
        <Table aria-label={titulo}>
          <TableHeader>
            <TableRow>
              {colunas.map((c) => (
                <TableHead key={c}>{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => (
              <TableRow key={linha.join('|')}>
                {linha.map((valor, i) => (
                  <TableCell key={colunas[i] ?? i}>{valor}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        children
      )}
    </section>
  )
}
