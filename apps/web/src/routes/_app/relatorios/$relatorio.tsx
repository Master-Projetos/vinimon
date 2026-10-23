import { useQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { type MediaOperador, type Relatorio, TIPOS_RELATORIO } from '@vinimon/shared'
import { Download, Printer } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { z } from 'zod'
import { StatCard } from '@/components/display/stat-card'
import { ErrorState } from '@/components/feedback/error-state'
import { NotFoundState } from '@/components/feedback/not-found-state'
import { Button } from '@/components/ui/button'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { RelatorioFiltros } from '@/features/relatorios/components/relatorio-filtros'
import {
  type ColunaTabela,
  formatarPct,
  formatarTempo,
  RelatorioTabela,
  TabelaOrdenavel,
  TabelaSla,
} from '@/features/relatorios/components/relatorio-tabela'
import {
  RelatorioBuscaSchema,
  ROTULOS_RELATORIO,
  relatorioConsultas,
  urlCsvRelatorio,
} from '@/features/relatorios/queries'

export const Route = createFileRoute('/_app/relatorios/$relatorio')({
  params: {
    parse: (p) => {
      const resultado = z.enum(TIPOS_RELATORIO).safeParse(p.relatorio)
      if (!resultado.success) throw notFound()
      return { relatorio: resultado.data }
    },
  },
  validateSearch: RelatorioBuscaSchema,
  notFoundComponent: () => (
    <NotFoundState titulo="Relatório não encontrado" descricao="Escolha um dos relatórios no menu acima." />
  ),
  component: RelatorioPagina,
})

function RelatorioPagina() {
  const { relatorio: tipo } = Route.useParams()
  const busca = Route.useSearch()
  const navigate = Route.useNavigate()
  const consulta = useQuery(relatorioConsultas.obter(tipo, busca))

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-title" tabIndex={-1}>
          {ROTULOS_RELATORIO[tipo]}
        </h1>
        <div className="flex gap-2" data-print="ocultar">
          <Button variant="outline" asChild>
            <a href={urlCsvRelatorio(tipo, busca)}>
              <Download aria-hidden="true" /> Exportar CSV
            </a>
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer aria-hidden="true" /> Imprimir
          </Button>
        </div>
      </header>

      <RelatorioFiltros
        key={JSON.stringify(busca)}
        valores={busca}
        aoAplicar={(novo) => void navigate({ search: novo })}
      />

      {consulta.isPending ? (
        <div className="grid gap-3" aria-busy="true">
          <span className="sr-only">Carregando relatório</span>
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : consulta.isError ? (
        <ErrorState erro={consulta.error} aoTentarNovamente={() => void consulta.refetch()} />
      ) : (
        <ConteudoRelatorio relatorio={consulta.data} />
      )}
    </section>
  )
}

const CONFIG_GRAFICO: ChartConfig = {
  total: { label: 'Total', color: 'var(--chart-1)' },
  encerrados: { label: 'Encerrados', color: 'var(--chart-2)' },
}

function formatarDiaIso(iso: string): string {
  return iso.split('-').reverse().join('/')
}

function formatarMedia(valor: number | string | null): string {
  return typeof valor === 'number' ? valor.toFixed(2).replace('.', ',') : '—'
}

const COLUNAS_OPERADOR: ColunaTabela<MediaOperador>[] = [
  { id: 'nome', rotulo: 'Operador', valor: (l) => l.nome },
  { id: 'avaliadas', rotulo: 'Avaliadas', valor: (l) => l.avaliadas },
  { id: 'media', rotulo: 'Média (1 a 4)', valor: (l) => l.media, formatar: formatarMedia },
]

function ConteudoRelatorio({ relatorio }: { relatorio: Relatorio }) {
  const { totais, linhas, sla, avaliacoes } = relatorio
  const dadosGrafico = linhas.map((l) => ({ nome: l.nome, total: l.total, encerrados: l.encerrados }))

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Período: {formatarDiaIso(relatorio.de)} a {formatarDiaIso(relatorio.ate)}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard titulo="Chamados" valor={totais.total} />
        <StatCard titulo="Encerrados" valor={totais.encerrados} />
        <StatCard titulo="No prazo" valor={formatarPct(totais.pctNoPrazo)} />
        <StatCard titulo="Tempo médio de solução" valor={formatarTempo(totais.tempoMedioSolucaoUtilMin)} />
        {avaliacoes ? (
          <>
            <StatCard titulo="Avaliações" valor={avaliacoes.avaliadas} />
            <StatCard titulo="Média geral (1 a 4)" valor={formatarMedia(avaliacoes.mediaGeral)} />
          </>
        ) : null}
      </div>

      {linhas.length > 0 ? (
        <section aria-label="Gráfico do relatório" className="rounded-lg border bg-card p-4">
          <ChartContainer config={CONFIG_GRAFICO} className="h-64 w-full">
            <BarChart accessibilityLayer data={dadosGrafico}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="nome" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="total" fill="var(--color-total)" radius={4} />
              <Bar dataKey="encerrados" fill="var(--color-encerrados)" radius={4} />
            </BarChart>
          </ChartContainer>
        </section>
      ) : null}

      <RelatorioTabela rotulo="Dados do relatório" linhas={linhas} />

      {sla ? (
        <>
          <TabelaSla rotulo="SLA por área" linhas={sla.porArea} />
          <TabelaSla rotulo="SLA por problema" linhas={sla.porProblema} />
        </>
      ) : null}

      {avaliacoes ? (
        <TabelaOrdenavel
          rotulo="Avaliações por operador"
          linhas={avaliacoes.mediaPorOperador}
          colunas={COLUNAS_OPERADOR}
          vazio="Nenhuma avaliação no período."
        />
      ) : null}
    </div>
  )
}
