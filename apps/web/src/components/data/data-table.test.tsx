import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ler, remover } from '@/lib/storage'
import { DataTable, type DataTableProps } from './data-table'
import { DataTableBulkBar } from './data-table-bulk-bar'
import { DataTableColumnHeader } from './data-table-column-header'

// Radix (Popper) usa ResizeObserver, que o jsdom não tem.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

interface Linha {
  id: string
  titulo: string
  situacao: string
}

const DADOS: Linha[] = [
  { id: 'CH-1', titulo: 'Impressora parada', situacao: 'Aberto' },
  { id: 'CH-2', titulo: 'Monitor piscando', situacao: 'Fechado' },
]

const CHAVE = 'teste:colunas:v1'

interface Ordenacao {
  campo: string
  direcao: 'asc' | 'desc'
}

function Exemplo({ ordenacaoInicial }: { ordenacaoInicial?: Ordenacao }) {
  const [selecao, setSelecao] = React.useState<RowSelectionState>({})
  const [ordenacao, setOrdenacao] = React.useState<Ordenacao | undefined>(ordenacaoInicial)

  const colunas = React.useMemo<ColumnDef<Linha, unknown>[]>(
    () => [
      {
        id: 'titulo',
        header: ({ column }) => (
          <DataTableColumnHeader titulo="Título" campo={column.id} ordenacao={ordenacao} aoOrdenar={setOrdenacao} />
        ),
        cell: ({ row }) => row.original.titulo,
      },
      {
        id: 'situacao',
        header: 'Situação',
        enableSorting: false,
        cell: ({ row }) => row.original.situacao,
      },
    ],
    [ordenacao],
  )

  const propsTabela: DataTableProps<Linha> = {
    rotulo: 'Chamados',
    colunas,
    dados: DADOS,
    obterIdLinha: (linha) => linha.id,
    total: DADOS.length,
    pagina: 1,
    porPagina: 25,
    aoMudarPagina: () => {},
    aoMudarPorPagina: () => {},
    ordenacao,
    aoOrdenar: setOrdenacao,
    selecionavel: true,
    selecao,
    aoMudarSelecao: setSelecao,
    vazio: 'Nada aqui',
    chavePersistencia: CHAVE,
  }

  return (
    <>
      <DataTable {...propsTabela} />
      <DataTableBulkBar quantidade={Object.keys(selecao).length} aoLimpar={() => setSelecao({})}>
        <span>Ação em massa</span>
      </DataTableBulkBar>
    </>
  )
}

beforeEach(() => {
  remover(CHAVE)
})

afterEach(() => {
  cleanup()
  remover(CHAVE)
})

describe('DataTable', () => {
  it('seleciona linha e a página inteira, anunciando a contagem', () => {
    render(<Exemplo />)
    const checkLinha = screen.getByRole('checkbox', { name: 'Selecionar linha CH-1' })
    fireEvent.click(checkLinha)
    expect(screen.getByRole('checkbox', { name: 'Selecionar linha CH-1' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Selecionar linha CH-2' })).not.toBeChecked()

    const regiao = screen.getByText('1 selecionado').closest('[aria-live="polite"]')
    expect(regiao).not.toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todas as linhas da página' }))
    expect(screen.getByRole('checkbox', { name: 'Selecionar linha CH-2' })).toBeChecked()
    expect(screen.getByText('2 selecionados')).toBeInTheDocument()
  })

  it('marca aria-sort conforme a ordenação e alterna a direção ao clicar', () => {
    render(<Exemplo ordenacaoInicial={{ campo: 'titulo', direcao: 'asc' }} />)
    const cabecalho = screen.getByRole('columnheader', { name: /Título/ })
    expect(cabecalho).toHaveAttribute('aria-sort', 'ascending')

    fireEvent.click(within(cabecalho).getByRole('button', { name: 'Ordenar por Título' }))
    expect(screen.getByRole('columnheader', { name: /Título/ })).toHaveAttribute('aria-sort', 'descending')
  })

  it('oculta coluna pelo alternador e grava a escolha', () => {
    render(<Exemplo />)
    expect(screen.getByRole('columnheader', { name: 'Situação' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('button', { name: /Colunas/ }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Situação' }))

    expect(screen.queryByRole('columnheader', { name: 'Situação' })).not.toBeInTheDocument()
    expect(ler<Record<string, boolean>>(CHAVE, {})).toEqual({ situacao: false })
  })
})
