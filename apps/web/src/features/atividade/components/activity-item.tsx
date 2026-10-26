import { type NotificacaoDTO, textoNotificacao } from '@vinimon/shared'
import { RelativeTime } from '@/components/display/relative-time'
import { cn } from '@/lib/utils'

export interface ActivityItemProps {
  notificacao: NotificacaoDTO
  selecionado: boolean
  aoAbrir: (n: NotificacaoDTO) => void
}

/** Uma linha do feed: ponto de não lida, título do chamado, texto do sistema e hora. */
export function ActivityItem({ notificacao: n, selecionado, aoAbrir }: ActivityItemProps) {
  return (
    <button
      type="button"
      data-item-id={n.id}
      aria-current={selecionado ? 'true' : undefined}
      onClick={() => aoAbrir(n)}
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        !n.lida && 'bg-accent/40 font-medium',
        selecionado && 'border-primary',
      )}
    >
      <span className="flex items-center gap-2">
        {!n.lida ? <span aria-label="Não lida" role="img" className="size-2 shrink-0 rounded-full bg-primary" /> : null}
        <span className="truncate">
          #{n.chamado.id} · {n.chamado.assunto}
        </span>
      </span>
      <span className="truncate text-xs text-muted-foreground">{textoNotificacao(n)}</span>
      <span className="text-xs text-muted-foreground">
        <RelativeTime valor={n.atualizadoEm} />
      </span>
    </button>
  )
}
