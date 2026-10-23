import { Link } from '@tanstack/react-router'
import type { ChamadoResumo } from '@vinimon/shared'
import { PrioridadeBadge } from '@/components/display/prioridade-badge'
import { SlaBadge } from '@/components/display/sla-badge'
import { StatusBadge } from '@/components/display/status-badge'
import { Badge } from '@/components/ui/badge'
import { formatarRelativo } from '@/lib/datas'
import { cn } from '@/lib/utils'
import { slaDoChamado } from '../columns'

export interface ChamadoListItemProps {
  chamado: ChamadoResumo
  agora: Date
}

/** Cartão do chamado para telas estreitas (a tabela só aparece de `md` para cima). */
export function ChamadoListItem({ chamado, agora }: ChamadoListItemProps) {
  return (
    <li>
      <Link
        to="/chamados/$chamadoId"
        params={{ chamadoId: chamado.id }}
        className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {chamado.naoLido ? (
            <span role="img" aria-label="Não lido" className="size-2 rounded-full bg-primary" />
          ) : null}
          <span className="tabular-nums">#{chamado.id}</span>
          {chamado.novo ? <Badge variant="secondary">Novo</Badge> : null}
          <span className="ml-auto">{formatarRelativo(chamado.ultimaAtividadeEm, agora)}</span>
        </span>
        <span className={cn('text-sm', chamado.naoLido && 'font-semibold')}>{chamado.assunto}</span>
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge nome={chamado.status.nome} cor={chamado.status.cor} />
          <PrioridadeBadge nome={chamado.prioridade.nome} cor={chamado.prioridade.cor} />
          <SlaBadge sla={slaDoChamado(chamado)} agora={agora} />
        </span>
        <span className="text-xs text-muted-foreground">
          {chamado.solicitante.nome} · {chamado.area.nome}
          {chamado.operador ? ` · ${chamado.operador.nome}` : ' · Sem responsável'}
        </span>
      </Link>
    </li>
  )
}
