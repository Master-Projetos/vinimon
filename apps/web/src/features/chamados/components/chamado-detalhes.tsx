import { type ChamadoDetalhe, type DadosSla, type SituacaoSla, situacaoSla } from '@vinimon/shared'
import { KeyValueGrid, type KeyValueItem } from '@/components/display/key-value-grid'
import { SlaBadge } from '@/components/display/sla-badge'
import { Progress } from '@/components/ui/progress'
import { useAgora } from '@/hooks/use-agora'
import { formatarDataHora, formatarRelativo } from '@/lib/datas'
import { ROTULOS_NOTA_AVALIACAO } from '@/lib/rotulos'

export interface ChamadoDetalhesProps {
  detalhe: ChamadoDetalhe
}

const data = (d: Date | null) => (d ? formatarDataHora(d) : '—')

/** Percentual do prazo já consumido, de `abertoEm` até `prazo`; 100 quando finalizado ou vencido. */
export function percentualSla(sla: DadosSla, situacao: SituacaoSla, abertoEm: Date, agora: Date): number {
  if (situacao === 'CUMPRIDO' || situacao === 'VIOLADO' || situacao === 'ESTOURADO') return 100
  if (!sla.prazo) return 0
  const total = sla.prazo.getTime() - abertoEm.getTime()
  if (total <= 0) return 100
  return Math.min(100, Math.max(0, Math.round(((agora.getTime() - abertoEm.getTime()) / total) * 100)))
}

function textoSla(sla: DadosSla, situacao: SituacaoSla, agora: Date): string {
  switch (situacao) {
    case 'SEM_SLA':
      return 'Sem meta de SLA.'
    case 'PAUSADO':
      return 'Relógio parado.'
    case 'CUMPRIDO':
      return 'Cumprido dentro do prazo.'
    case 'VIOLADO':
      return sla.prazo ? `Prazo vencido em ${formatarDataHora(sla.prazo)}.` : 'Prazo vencido.'
    case 'ESTOURADO':
      return sla.prazo
        ? `Vencido ${formatarRelativo(sla.prazo, agora)} (${formatarDataHora(sla.prazo)}).`
        : 'Prazo vencido.'
    default:
      return sla.prazo ? `Vence ${formatarRelativo(sla.prazo, agora)} (${formatarDataHora(sla.prazo)}).` : ''
  }
}

const CLASSE_BARRA: Partial<Record<SituacaoSla, string>> = {
  ESTOURADO: '[&_[data-slot=progress-indicator]]:bg-red-600',
  VIOLADO: '[&_[data-slot=progress-indicator]]:bg-red-600',
  EM_RISCO: '[&_[data-slot=progress-indicator]]:bg-amber-500',
  CUMPRIDO: '[&_[data-slot=progress-indicator]]:bg-emerald-600',
}

function PrazoSla({ titulo, sla, detalhe }: { titulo: string; sla: DadosSla; detalhe: ChamadoDetalhe }) {
  const agora = useAgora(60_000)
  const situacao = situacaoSla(sla, agora)
  const valor = percentualSla(sla, situacao, detalhe.abertoEm, agora)
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{titulo}</span>
        <SlaBadge sla={sla} agora={agora} />
      </div>
      <Progress value={valor} aria-label={`${titulo}: ${valor}% do prazo`} className={CLASSE_BARRA[situacao]} />
      <p className="text-xs text-muted-foreground">{textoSla(sla, situacao, agora)}</p>
    </li>
  )
}

/** Aba "Detalhes" (§6.3 item 6): pessoas, classificação, prazos de SLA, datas, avaliação e rejeições. */
export function ChamadoDetalhes({ detalhe }: ChamadoDetalhesProps) {
  const emNomeDeOutro = detalhe.abertoPor.id !== detalhe.solicitante.id
  const cancelado = detalhe.cancelado

  const pessoas: KeyValueItem[] = [
    { rotulo: 'Solicitante', valor: detalhe.solicitante.nome },
    {
      rotulo: 'Origem',
      valor: emNomeDeOutro
        ? `Aberto por ${detalhe.abertoPor.nome} em nome de ${detalhe.solicitante.nome}`
        : `Aberto por ${detalhe.abertoPor.nome}`,
    },
    { rotulo: 'Contato', valor: detalhe.contato ?? '—' },
    { rotulo: 'E-mail de contato', valor: detalhe.contatoEmail ?? '—' },
    { rotulo: 'Telefone', valor: detalhe.telefone ?? '—' },
    { rotulo: 'Operador', valor: detalhe.operador?.nome ?? '—' },
  ]
  const classificacao: KeyValueItem[] = [
    { rotulo: 'Área', valor: detalhe.area.nome },
    { rotulo: 'Tipo de problema', valor: detalhe.problema?.nome ?? '—' },
    { rotulo: 'Departamento', valor: detalhe.departamento?.nome ?? '—' },
    { rotulo: 'Ativo', valor: detalhe.ativo?.etiqueta ?? '—' },
    { rotulo: 'Canal', valor: detalhe.canal.nome },
    ...(detalhe.tags
      ? [{ rotulo: 'Tags', valor: detalhe.tags.length > 0 ? detalhe.tags.map((t) => t.nome).join(', ') : '—' }]
      : []),
  ]
  const datas: KeyValueItem[] = [
    { rotulo: 'Aberto em', valor: data(detalhe.abertoEm) },
    { rotulo: 'Primeira resposta', valor: data(detalhe.primeiraRespostaEm) },
    { rotulo: 'Status desde', valor: data(detalhe.statusDesde) },
    { rotulo: 'Agendado para', valor: data(detalhe.agendadoPara) },
    { rotulo: 'Concluído em', valor: data(detalhe.concluidoEm) },
    { rotulo: 'Limite de validação', valor: data(detalhe.validacaoLimiteEm) },
    { rotulo: 'Encerrado em', valor: data(detalhe.encerradoEm) },
  ]
  const avaliacao: KeyValueItem[] = [
    {
      rotulo: 'Avaliação',
      valor: detalhe.avaliacao
        ? `${ROTULOS_NOTA_AVALIACAO[detalhe.avaliacao.nota]}${detalhe.avaliacao.automatica ? ' (automática)' : ''}`
        : 'Sem avaliação',
    },
    ...(detalhe.avaliacao?.comentario ? [{ rotulo: 'Comentário', valor: detalhe.avaliacao.comentario }] : []),
    { rotulo: 'Rejeições', valor: String(detalhe.rejeicoes) },
  ]

  return (
    <div className="flex flex-col gap-8 p-(--pane-px) py-6">
      <section aria-labelledby="det-pessoas" className="flex flex-col gap-3">
        <h2 id="det-pessoas" className="text-sm font-semibold">
          Pessoas
        </h2>
        <KeyValueGrid itens={pessoas} />
      </section>
      <section aria-labelledby="det-classificacao" className="flex flex-col gap-3">
        <h2 id="det-classificacao" className="text-sm font-semibold">
          Classificação
        </h2>
        <KeyValueGrid itens={classificacao} />
      </section>
      <section aria-labelledby="det-sla" className="flex flex-col gap-3">
        <h2 id="det-sla" className="text-sm font-semibold">
          Prazos de SLA
        </h2>
        {cancelado ? (
          <p className="text-sm text-muted-foreground">Chamado cancelado: fora dos indicadores de SLA.</p>
        ) : (
          <ul className="flex max-w-xl flex-col gap-4">
            <PrazoSla titulo="Primeira resposta" sla={{ ...detalhe.sla.resposta, cancelado }} detalhe={detalhe} />
            <PrazoSla titulo="Solução" sla={{ ...detalhe.sla.solucao, cancelado }} detalhe={detalhe} />
          </ul>
        )}
      </section>
      <section aria-labelledby="det-datas" className="flex flex-col gap-3">
        <h2 id="det-datas" className="text-sm font-semibold">
          Datas
        </h2>
        <KeyValueGrid itens={datas} colunas={3} />
      </section>
      <section aria-labelledby="det-avaliacao" className="flex flex-col gap-3">
        <h2 id="det-avaliacao" className="text-sm font-semibold">
          Avaliação e rejeições
        </h2>
        <KeyValueGrid itens={avaliacao} />
      </section>
    </div>
  )
}
