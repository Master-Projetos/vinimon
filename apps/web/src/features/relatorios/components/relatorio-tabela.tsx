import type { LinhaRelatorio, LinhaSla } from '@vinimon/shared'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatarDuracao } from '@/lib/datas'

type Valor = number | string | null

/** Percentual de 0 a 100 com vírgula; `null` (sem base de cálculo) vira travessão. */
export function formatarPct(valor: Valor): string {
  return typeof valor === 'number' ? `${valor.toFixed(1).replace('.', ',')}%` : '—'
}

/** Minutos em texto (ex.: 2h 30min); `null` vira travessão. */
export function formatarTempo(valor: Valor): string {
  return typeof valor === 'number' ? formatarDuracao(valor) : '—'
}

export interface ColunaTabela<T> {
  id: string
  rotulo: string
  valor: (linha: T) => Valor
  formatar?: (valor: Valor) => string
}

type Direcao = 'asc' | 'desc'

function compararValores(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true })
}

/** Tabela ordenável no cliente: clicar no cabeçalho alterna asc/desc; valores vazios ficam sempre no fim. */
export function TabelaOrdenavel<T extends { chave: string }>({
  rotulo,
  linhas,
  colunas,
  vazio = 'Nenhum dado no período.',
}: {
  rotulo: string
  linhas: T[]
  colunas: ColunaTabela<T>[]
  vazio?: string
}) {
  const [ordem, setOrdem] = useState<{ id: string; direcao: Direcao } | null>(null)

  const exibidas = useMemo(() => {
    const coluna = colunas.find((c) => c.id === ordem?.id)
    if (ordem === null || coluna === undefined) return linhas
    const sinal = ordem.direcao === 'asc' ? 1 : -1
    return [...linhas].sort((x, y) => {
      const a = coluna.valor(x)
      const b = coluna.valor(y)
      if (a === null || b === null) return (a === null ? 1 : 0) - (b === null ? 1 : 0)
      return compararValores(a, b) * sinal
    })
  }, [linhas, colunas, ordem])

  function alternar(id: string) {
    setOrdem((atual) =>
      atual?.id === id ? { id, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' } : { id, direcao: 'asc' },
    )
  }

  if (linhas.length === 0) return <p className="text-sm text-muted-foreground">{vazio}</p>

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table aria-label={rotulo}>
        <TableHeader>
          <TableRow>
            {colunas.map((coluna) => {
              const direcao = ordem?.id === coluna.id ? ordem.direcao : undefined
              const Icone = direcao === 'asc' ? ArrowUp : direcao === 'desc' ? ArrowDown : ArrowUpDown
              return (
                <TableHead
                  key={coluna.id}
                  aria-sort={direcao === 'asc' ? 'ascending' : direcao === 'desc' ? 'descending' : 'none'}
                >
                  <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" onClick={() => alternar(coluna.id)}>
                    {coluna.rotulo}
                    <Icone aria-hidden="true" className="size-3.5" />
                  </Button>
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {exibidas.map((linha) => (
            <TableRow key={linha.chave}>
              {colunas.map((coluna) => {
                const valor = coluna.valor(linha)
                return (
                  <TableCell key={coluna.id} className="tabular-nums">
                    {coluna.formatar ? coluna.formatar(valor) : String(valor ?? '—')}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

const COLUNAS_LINHA: ColunaTabela<LinhaRelatorio>[] = [
  { id: 'nome', rotulo: 'Nome', valor: (l) => l.nome },
  { id: 'total', rotulo: 'Total', valor: (l) => l.total },
  { id: 'encerrados', rotulo: 'Encerrados', valor: (l) => l.encerrados },
  { id: 'pctNoPrazo', rotulo: 'No prazo', valor: (l) => l.pctNoPrazo, formatar: formatarPct },
  {
    id: 'tempoMedio',
    rotulo: 'Tempo médio de solução',
    valor: (l) => l.tempoMedioSolucaoUtilMin,
    formatar: formatarTempo,
  },
]

export function RelatorioTabela({ rotulo, linhas }: { rotulo: string; linhas: LinhaRelatorio[] }) {
  return <TabelaOrdenavel rotulo={rotulo} linhas={linhas} colunas={COLUNAS_LINHA} />
}

const COLUNAS_SLA: ColunaTabela<LinhaSla>[] = [
  { id: 'nome', rotulo: 'Nome', valor: (l) => l.nome },
  { id: 'total', rotulo: 'Total', valor: (l) => l.total },
  { id: 'pctResposta', rotulo: 'Resposta no prazo', valor: (l) => l.pctRespostaNoPrazo, formatar: formatarPct },
  { id: 'pctSolucao', rotulo: 'Solução no prazo', valor: (l) => l.pctSolucaoNoPrazo, formatar: formatarPct },
]

export function TabelaSla({ rotulo, linhas }: { rotulo: string; linhas: LinhaSla[] }) {
  return <TabelaOrdenavel rotulo={rotulo} linhas={linhas} colunas={COLUNAS_SLA} />
}
