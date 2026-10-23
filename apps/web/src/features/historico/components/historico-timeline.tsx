import type { ChamadoEvento, TipoEvento } from '@vinimon/shared'
import { useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatarDataHora } from '@/lib/datas'
import { textoEvento } from '../textos'

export const FILTROS_HISTORICO = [
  { valor: 'TUDO', rotulo: 'Tudo' },
  { valor: 'STATUS', rotulo: 'Status' },
  { valor: 'ATRIBUICAO', rotulo: 'Atribuição' },
  { valor: 'SLA', rotulo: 'SLA' },
  { valor: 'ANEXOS', rotulo: 'Anexos' },
] as const

export type FiltroHistorico = (typeof FILTROS_HISTORICO)[number]['valor']

const TIPOS_POR_FILTRO: Record<Exclude<FiltroHistorico, 'TUDO'>, readonly TipoEvento[]> = {
  STATUS: [
    'STATUS_ALTERADO',
    'PRIORIDADE_ALTERADA',
    'CONCLUIDO',
    'APROVADO',
    'REJEITADO',
    'AUTO_APROVADO',
    'SOLICITADO_RETORNO',
    'AUTO_ENCERRADO',
    'REABERTO',
    'CANCELADO',
    'AGENDADO',
    'RETORNO_AGENDAMENTO',
  ],
  ATRIBUICAO: ['ASSUMIDO', 'ENCAMINHADO'],
  SLA: ['SLA_RISCO', 'SLA_ESTOURADO', 'SLA_RESPOSTA_ESTOURADO'],
  ANEXOS: ['ANEXO_ADICIONADO', 'ANEXO_REMOVIDO'],
}

/** Eventos que passam pelo filtro, na ordem recebida. `TUDO` não corta nada. */
export function eventosDoFiltro(eventos: readonly ChamadoEvento[], filtro: FiltroHistorico): ChamadoEvento[] {
  if (filtro === 'TUDO') return [...eventos]
  const tipos = TIPOS_POR_FILTRO[filtro]
  return eventos.filter((evento) => tipos.includes(evento.tipo))
}

export interface HistoricoTimelineProps {
  eventos: ChamadoEvento[]
}

export function HistoricoTimeline({ eventos }: HistoricoTimelineProps) {
  const [filtro, setFiltro] = useState<FiltroHistorico>('TUDO')
  const visiveis = eventosDoFiltro(eventos, filtro)

  return (
    <section className="flex flex-col gap-4 p-4">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label="Filtrar histórico"
        value={filtro}
        onValueChange={(valor) => {
          const escolhido = FILTROS_HISTORICO.find((f) => f.valor === valor)
          if (escolhido) setFiltro(escolhido.valor)
        }}
      >
        {FILTROS_HISTORICO.map((f) => (
          <ToggleGroupItem key={f.valor} value={f.valor}>
            {f.rotulo}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {visiveis.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum evento neste filtro.</p>
      ) : (
        <ol aria-label="Linha do tempo do chamado" className="flex flex-col gap-3">
          {visiveis.map((evento) => (
            <li key={evento.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
              <span className="text-sm">{textoEvento(evento)}</span>
              <span className="text-xs text-muted-foreground">
                {evento.ator?.nome ?? 'Sistema'} ·{' '}
                <time dateTime={evento.criadoEm.toISOString()}>{formatarDataHora(evento.criadoEm)}</time>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
