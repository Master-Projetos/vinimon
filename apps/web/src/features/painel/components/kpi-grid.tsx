import { Link } from '@tanstack/react-router'
import type { ChamadoFiltros, PainelKpis } from '@vinimon/shared'
import { StatCard, type TomStat } from '@/components/display/stat-card'

interface Item {
  chave: keyof PainelKpis
  titulo: string
  tom: TomStat
  busca: Partial<Pick<ChamadoFiltros, 'visao' | 'sla'>>
  /** Também aparece na versão reduzida (USUARIO). */
  reduzido: boolean
}

const ITENS: readonly Item[] = [
  { chave: 'abertos', titulo: 'Abertos', tom: 'info', busca: { visao: 'todos' }, reduzido: true },
  {
    chave: 'filaSemResponsavel',
    titulo: 'Fila sem responsável',
    tom: 'alerta',
    busca: { visao: 'fila-aberta' },
    reduzido: false,
  },
  { chave: 'minhaFila', titulo: 'Minha fila', tom: 'info', busca: { visao: 'minha-fila' }, reduzido: false },
  { chave: 'abertosHoje', titulo: 'Abertos hoje', tom: 'neutro', busca: { visao: 'todos' }, reduzido: true },
  {
    chave: 'concluidosHoje',
    titulo: 'Concluídos hoje',
    tom: 'sucesso',
    busca: { visao: 'encerrados' },
    reduzido: true,
  },
  {
    chave: 'slaVencido',
    titulo: 'SLA vencido',
    tom: 'perigo',
    busca: { visao: 'todos', sla: 'ESTOURADO' },
    reduzido: false,
  },
  {
    chave: 'slaEmRisco',
    titulo: 'SLA em risco',
    tom: 'alerta',
    busca: { visao: 'todos', sla: 'EM_RISCO' },
    reduzido: false,
  },
  {
    chave: 'aguardandoValidacao',
    titulo: 'Aguardando validação',
    tom: 'info',
    busca: { visao: 'aguardando-validacao' },
    reduzido: true,
  },
]

export interface KpiGridProps {
  kpis: PainelKpis | undefined
  reduzido: boolean
}

/** StatCards do painel; cada um leva a `/chamados?visao=…`. */
export function KpiGrid({ kpis, reduzido }: KpiGridProps) {
  const itens = reduzido ? ITENS.filter((i) => i.reduzido) : ITENS
  return (
    <ul aria-label="Indicadores" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {itens.map((item) => (
        <li key={item.chave}>
          <Link
            to="/chamados"
            search={item.busca}
            className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <StatCard titulo={item.titulo} valor={kpis?.[item.chave] ?? 0} tom={item.tom} carregando={!kpis} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
