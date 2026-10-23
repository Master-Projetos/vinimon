import { Link } from '@tanstack/react-router'
import { type NotificacaoDTO, textoNotificacao } from '@vinimon/shared'
import { RelativeTime } from '@/components/display/relative-time'
import { cn } from '@/lib/utils'

export interface NotificationItemProps {
  notificacao: NotificacaoDTO
  aoAbrir: (n: NotificacaoDTO) => void
}

/** Uma linha do sino: título do chamado, texto do sistema (sem texto do usuário) e hora. */
export function NotificationItem({ notificacao: n, aoAbrir }: NotificationItemProps) {
  return (
    <Link
      to="/chamados/$chamadoId"
      params={{ chamadoId: n.chamado.id }}
      search={n.assentamentoId ? { foco: n.assentamentoId } : {}}
      onClick={() => aoAbrir(n)}
      className={cn(
        'flex flex-col gap-0.5 rounded-md px-3 py-2 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        !n.lida && 'bg-accent/40 font-medium',
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
    </Link>
  )
}
