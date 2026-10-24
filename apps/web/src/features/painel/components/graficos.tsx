import type { Painel } from '@vinimon/shared'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { ChartCard } from '@/components/display/chart-card'
import { useTheme } from '@/components/theme/theme-provider'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { corDeGrafico } from '@/lib/cores'
import { ROTULOS_NOTA_AVALIACAO } from '@/lib/rotulos'

const PALETA = ['#2563eb', '#059669', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#db2777', '#65a30d'] as const
const COR_NOTA = { OTIMO: '#059669', BOM: '#2563eb', REGULAR: '#d97706', RUIM: '#dc2626' } as const

export interface GraficosProps {
  painel: Painel
}

function Distribuicao({ titulo, itens }: { titulo: string; itens: Painel['porStatus'] }) {
  const { temaEfetivo } = useTheme()
  const dados = itens.map((i, n) => ({
    nome: i.nome,
    total: i.total,
    fill: corDeGrafico(PALETA[n % PALETA.length] ?? '#2563eb', temaEfetivo),
  }))
  const config: ChartConfig = { total: { label: 'Chamados' } }
  return (
    <ChartCard titulo={titulo} colunas={['Nome', 'Total']} linhas={itens.map((i) => [i.nome, i.total])}>
      <ChartContainer config={config} className="h-56 w-full">
        <BarChart accessibilityLayer data={dados} layout="vertical">
          <CartesianGrid horizontal={false} />
          <YAxis dataKey="nome" type="category" tickLine={false} axisLine={false} width={110} />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="total" radius={4}>
            {dados.map((d) => (
              <Cell key={d.nome} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}

/** Gráficos do painel; a versão reduzida (USUARIO) não traz a distribuição por área. */
export function Graficos({ painel }: GraficosProps) {
  const { temaEfetivo } = useTheme()
  const meses = painel.abertosEncerradosPorMes
  const configMeses: ChartConfig = {
    abertos: { label: 'Abertos', color: corDeGrafico('#2563eb', temaEfetivo) },
    encerrados: { label: 'Encerrados', color: corDeGrafico('#059669', temaEfetivo) },
  }
  const notas = painel.avaliacoesDoMes.map((a) => ({
    nome: ROTULOS_NOTA_AVALIACAO[a.nota],
    total: a.total,
    fill: corDeGrafico(COR_NOTA[a.nota], temaEfetivo),
  }))
  const configNotas: ChartConfig = { total: { label: 'Avaliações' } }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard
        titulo="Abertos × encerrados"
        colunas={['Mês', 'Abertos', 'Encerrados']}
        linhas={meses.map((m) => [m.mes, m.abertos, m.encerrados])}
      >
        <ChartContainer config={configMeses} className="h-56 w-full">
          <BarChart accessibilityLayer data={meses}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="mes" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="abertos" fill="var(--color-abertos)" radius={4} />
            <Bar dataKey="encerrados" fill="var(--color-encerrados)" radius={4} />
          </BarChart>
        </ChartContainer>
      </ChartCard>
      <Distribuicao titulo="Em aberto por status" itens={painel.porStatus} />
      <Distribuicao titulo="Em aberto por prioridade" itens={painel.porPrioridade} />
      {painel.reduzido ? null : <Distribuicao titulo="Em aberto por área" itens={painel.porArea} />}
      <ChartCard titulo="Avaliações do mês" colunas={['Nota', 'Total']} linhas={notas.map((n) => [n.nome, n.total])}>
        <ChartContainer config={configNotas} className="h-56 w-full">
          <PieChart accessibilityLayer>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie data={notas} dataKey="total" nameKey="nome" innerRadius={40}>
              {notas.map((n) => (
                <Cell key={n.nome} fill={n.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </ChartCard>
    </div>
  )
}
