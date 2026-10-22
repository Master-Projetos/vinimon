import {
  type ColumnDef,
  type ColumnMeta,
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  type RowData,
  type RowSelectionState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import * as React from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ler } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { DataTableColumnToggle } from './data-table-column-toggle'
import { DataTablePagination } from './data-table-pagination'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    ocultarAbaixo?: 'md' | 'lg' | 'xl'
    alinhar?: 'inicio' | 'fim'
    larguraClasse?: string
  }
}

const ESQUELETOS = ['esq-1', 'esq-2', 'esq-3', 'esq-4', 'esq-5'] as const

type MetaColuna = ColumnMeta<RowData, unknown>

const CLASSE_OCULTAR: Record<NonNullable<MetaColuna['ocultarAbaixo']>, string> = {
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
}

function classesColuna(meta: MetaColuna | undefined): string {
  return cn(
    meta?.ocultarAbaixo && CLASSE_OCULTAR[meta.ocultarAbaixo],
    meta?.alinhar === 'fim' ? 'text-right' : 'text-left',
    meta?.larguraClasse,
  )
}

/** Visibilidade salva pelo alternador de colunas; valor corrompido vira "tudo visível". */
function lerVisibilidadeSalva(chave: string): VisibilityState {
  const salvo = ler<VisibilityState>(chave, {})
  if (typeof salvo !== 'object' || salvo === null) return {}
  return Object.values(salvo).every((valor) => typeof valor === 'boolean') ? salvo : {}
}

export interface DataTableProps<TData> {
  rotulo: string
  colunas: ColumnDef<TData, unknown>[]
  dados: TData[]
  obterIdLinha: (l: TData) => string
  total: number
  pagina: number
  porPagina: 25 | 50 | 100
  aoMudarPagina: (p: number) => void
  aoMudarPorPagina: (n: 25 | 50 | 100) => void
  ordenacao?: { campo: string; direcao: 'asc' | 'desc' }
  aoOrdenar?: (o: { campo: string; direcao: 'asc' | 'desc' }) => void
  selecionavel?: boolean
  selecao?: RowSelectionState
  aoMudarSelecao?: (s: RowSelectionState) => void
  colunasVisiveis?: VisibilityState
  aoMudarColunasVisiveis?: (v: VisibilityState) => void
  aoClicarLinha?: (l: TData) => void
  carregando?: boolean
  atualizando?: boolean
  vazio: React.ReactNode
  barraFerramentas?: React.ReactNode
  rodape?: React.ReactNode
  /** Desvio: quando informado, mostra o alternador de colunas e grava a visibilidade nesta chave. */
  chavePersistencia?: string
}

/** Tabela de dados com react-table v8. Paginação e ordenação ficam no servidor (manual). */
export function DataTable<TData>({
  rotulo,
  colunas,
  dados,
  obterIdLinha,
  total,
  pagina,
  porPagina,
  aoMudarPagina,
  aoMudarPorPagina,
  ordenacao,
  aoOrdenar,
  selecionavel = false,
  selecao,
  aoMudarSelecao,
  colunasVisiveis,
  aoMudarColunasVisiveis,
  aoClicarLinha,
  carregando = false,
  atualizando = false,
  vazio,
  barraFerramentas,
  rodape,
  chavePersistencia,
}: DataTableProps<TData>) {
  const [selecaoLocal, setSelecaoLocal] = React.useState<RowSelectionState>({})
  const [visibilidadeLocal, setVisibilidadeLocal] = React.useState<VisibilityState>(() =>
    chavePersistencia ? lerVisibilidadeSalva(chavePersistencia) : {},
  )
  const selecaoAtual = selecao ?? selecaoLocal
  const visibilidadeAtual = colunasVisiveis ?? visibilidadeLocal

  const colunasFinais = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!selecionavel) return colunas
    const colunaSelecao: ColumnDef<TData, unknown> = {
      id: 'selecao',
      enableHiding: false,
      enableSorting: false,
      meta: { alinhar: 'inicio', larguraClasse: 'w-10' },
      header: ({ table }) => (
        <Checkbox
          aria-label="Selecionar todas as linhas da página"
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(valor) => table.toggleAllPageRowsSelected(valor === true)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Selecionar linha ${row.id}`}
          checked={row.getIsSelected()}
          onCheckedChange={(valor) => row.toggleSelected(valor === true)}
        />
      ),
    }
    return [colunaSelecao, ...colunas]
  }, [colunas, selecionavel])

  const table = useReactTable({
    data: dados,
    columns: colunasFinais,
    getRowId: (linha) => obterIdLinha(linha),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    enableRowSelection: selecionavel,
    state: { rowSelection: selecaoAtual, columnVisibility: visibilidadeAtual },
    onRowSelectionChange: (atualizacao) => {
      const proximo = functionalUpdate(atualizacao, selecaoAtual)
      if (aoMudarSelecao) aoMudarSelecao(proximo)
      else setSelecaoLocal(proximo)
    },
    onColumnVisibilityChange: (atualizacao) => {
      const proximo = functionalUpdate(atualizacao, visibilidadeAtual)
      if (aoMudarColunasVisiveis) aoMudarColunasVisiveis(proximo)
      else setVisibilidadeLocal(proximo)
    },
  })

  const colSpan = table.getVisibleLeafColumns().length

  return (
    <div className="flex flex-col gap-3" aria-busy={carregando || undefined}>
      {barraFerramentas || chavePersistencia ? (
        <div className="flex flex-wrap items-center gap-2">
          {barraFerramentas}
          {chavePersistencia ? (
            <div className="ml-auto">
              <DataTableColumnToggle table={table} chavePersistencia={chavePersistencia} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={cn('rounded-md border', atualizando && 'opacity-60 transition-opacity')}>
        <Table aria-label={rotulo}>
          <TableHeader>
            {table.getHeaderGroups().map((grupo) => (
              <TableRow key={grupo.id} className="hover:bg-transparent">
                {grupo.headers.map((header) => {
                  const ordenavel = Boolean(aoOrdenar) && header.column.columnDef.enableSorting !== false
                  const direcao = ordenacao?.campo === header.column.id ? ordenacao.direcao : undefined
                  return (
                    <TableHead
                      key={header.id}
                      className={classesColuna(header.column.columnDef.meta)}
                      aria-sort={
                        ordenavel
                          ? direcao === 'asc'
                            ? 'ascending'
                            : direcao === 'desc'
                              ? 'descending'
                              : 'none'
                          : undefined
                      }
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {carregando ? (
              ESQUELETOS.map((chave) => (
                <TableRow key={chave}>
                  <TableCell colSpan={colSpan}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colSpan} className="py-8">
                  {vazio}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(aoClicarLinha && 'cursor-pointer')}
                  onClick={aoClicarLinha ? () => aoClicarLinha(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={classesColuna(cell.column.columnDef.meta)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination
        total={total}
        pagina={pagina}
        porPagina={porPagina}
        aoMudarPagina={aoMudarPagina}
        aoMudarPorPagina={aoMudarPorPagina}
      />
      {rodape}
    </div>
  )
}
