import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { type ChamadoResumo, situacaoSla } from '@vinimon/shared'
import { Paperclip, TriangleAlert } from 'lucide-react'
import { DataTableColumnHeader } from '@/components/data/data-table-column-header'
import { PrioridadeBadge } from '@/components/display/prioridade-badge'
import { SlaBadge } from '@/components/display/sla-badge'
import { StatusBadge } from '@/components/display/status-badge'
import { Badge } from '@/components/ui/badge'
import { formatarDataHora, formatarRelativo } from '@/lib/datas'
import { cn } from '@/lib/utils'

export interface OrdenacaoChamados {
  campo: string
  direcao: 'asc' | 'desc'
}

export interface OpcoesColunas {
  ordenacao: OrdenacaoChamados
  aoOrdenar: (o: OrdenacaoChamados) => void
  agora: Date
}

/** Dados do SLA de solução no formato do `SlaBadge` (leva `cancelado` do chamado). */
export const slaDoChamado = (c: ChamadoResumo) => ({ ...c.sla.solucao, cancelado: c.cancelado })

/** Selo "Novo" aparece até 10 minutos depois da abertura (o servidor já manda `novo`). */
export function AssuntoDoChamado({ chamado, agora }: { chamado: ChamadoResumo; agora: Date }) {
  const vencido = situacaoSla(slaDoChamado(chamado), agora) === 'ESTOURADO'
  const interacao = chamado.ultimaInteracao
  return (
    <span
      className="flex min-w-0 items-center gap-2"
      title={interacao ? `Última interação em ${formatarDataHora(interacao.em)}` : undefined}
    >
      {chamado.naoLido ? (
        <span role="img" aria-label="Não lido" className="size-2 shrink-0 rounded-full bg-primary" />
      ) : null}
      <Link
        to="/chamados/$chamadoId"
        params={{ chamadoId: chamado.id }}
        className={cn('truncate hover:underline focus-visible:underline', chamado.naoLido && 'font-semibold')}
        onClick={(e) => e.stopPropagation()}
      >
        {chamado.assunto}
      </Link>
      {chamado.novo ? <Badge variant="secondary">Novo</Badge> : null}
      {chamado.qtdAnexos > 0 ? (
        <span
          className="inline-flex shrink-0 items-center text-muted-foreground"
          title={`${chamado.qtdAnexos} anexo(s)`}
        >
          <Paperclip aria-hidden="true" className="size-3.5" />
          <span className="sr-only">Com anexos</span>
        </span>
      ) : null}
      {vencido ? (
        <span className="inline-flex shrink-0 items-center text-destructive">
          <TriangleAlert aria-hidden="true" className="size-3.5" />
          <span className="sr-only">SLA vencido</span>
        </span>
      ) : null}
    </span>
  )
}

/** Colunas da §6.3 (seleção entra pelo `DataTable`). Os `id`s ordenáveis são os campos de `ORDENS_CHAMADO`. */
export function colunasChamados({ ordenacao, aoOrdenar, agora }: OpcoesColunas): ColumnDef<ChamadoResumo, unknown>[] {
  const cabecalho = (titulo: string, campo: string) => () => (
    <DataTableColumnHeader titulo={titulo} campo={campo} ordenacao={ordenacao} aoOrdenar={aoOrdenar} />
  )
  return [
    {
      id: 'id',
      header: cabecalho('#', 'id'),
      cell: ({ row }) => <span className="tabular-nums">#{row.original.id}</span>,
      meta: { larguraClasse: 'w-20' },
    },
    {
      id: 'assunto',
      header: 'Assunto',
      enableSorting: false,
      cell: ({ row }) => <AssuntoDoChamado chamado={row.original} agora={agora} />,
      meta: { larguraClasse: 'max-w-80' },
    },
    {
      id: 'solicitante',
      header: 'Solicitante',
      enableSorting: false,
      cell: ({ row }) => row.original.solicitante.nome,
      meta: { ocultarAbaixo: 'lg' },
    },
    {
      id: 'area',
      header: 'Área',
      enableSorting: false,
      cell: ({ row }) => row.original.area.nome,
      meta: { ocultarAbaixo: 'lg' },
    },
    {
      id: 'problema',
      header: 'Problema',
      enableSorting: false,
      cell: ({ row }) => row.original.problema?.nome ?? '—',
      meta: { ocultarAbaixo: 'xl' },
    },
    {
      id: 'prioridade',
      header: cabecalho('Prioridade', 'prioridade'),
      cell: ({ row }) => <PrioridadeBadge nome={row.original.prioridade.nome} cor={row.original.prioridade.cor} />,
    },
    {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => <StatusBadge nome={row.original.status.nome} cor={row.original.status.cor} />,
    },
    {
      id: 'operador',
      header: 'Operador',
      enableSorting: false,
      cell: ({ row }) => row.original.operador?.nome ?? <span className="text-muted-foreground">Sem responsável</span>,
      meta: { ocultarAbaixo: 'lg' },
    },
    {
      id: 'prazoSolucao',
      header: cabecalho('SLA', 'prazoSolucao'),
      cell: ({ row }) => <SlaBadge sla={slaDoChamado(row.original)} agora={agora} />,
      meta: { ocultarAbaixo: 'md' },
    },
    {
      id: 'ultimaAtividade',
      header: cabecalho('Atualização', 'ultimaAtividade'),
      cell: ({ row }) => (
        <time
          dateTime={row.original.ultimaAtividadeEm.toISOString()}
          title={formatarDataHora(row.original.ultimaAtividadeEm)}
        >
          {formatarRelativo(row.original.ultimaAtividadeEm, agora)}
        </time>
      ),
      meta: { ocultarAbaixo: 'md', alinhar: 'fim' },
    },
  ]
}
