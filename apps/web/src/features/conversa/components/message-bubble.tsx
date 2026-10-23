import type { Assentamento } from '@vinimon/shared'
import { Markdown } from '@/components/display/markdown'
import { UserAvatar } from '@/components/display/user-avatar'
import { formatarHora } from '@/lib/datas'
import { cn } from '@/lib/utils'

export interface MessageBubbleProps {
  assentamento: Assentamento
  usuarioId: number
  /** Primeira mensagem do grupo do mesmo autor: mostra avatar, nome e hora. */
  inicioDeGrupo: boolean
  focado?: boolean
}

/** Mensagem da conversa. Interna usa `bg-private`; menção a quem lê usa `bg-mention`. */
export function MessageBubble({ assentamento, usuarioId, inicioDeGrupo, focado = false }: MessageBubbleProps) {
  const { autor, texto, interno, criadoEm, id } = assentamento
  const minha = autor?.id === usuarioId
  const mencionaMe = texto.includes(`(usuario:${usuarioId})`)
  return (
    <article
      data-assentamento-id={id}
      aria-label={`Mensagem de ${autor?.nome ?? 'sistema'}${interno ? ', nota interna' : ''}`}
      className={cn('flex gap-2', minha && 'flex-row-reverse', !inicioDeGrupo && 'mt-[-0.25rem]')}
    >
      <div className="w-8 shrink-0">{inicioDeGrupo && autor ? <UserAvatar usuario={autor} tamanho="sm" /> : null}</div>
      <div className={cn('flex min-w-0 max-w-[80%] flex-col gap-1', minha && 'items-end')}>
        {inicioDeGrupo ? (
          <header className="flex items-baseline gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{autor?.nome ?? 'Sistema'}</span>
            <time dateTime={criadoEm.toISOString()} className="tabular-nums">
              {formatarHora(criadoEm)}
            </time>
            {interno ? <span className="font-medium text-private-foreground">Nota interna</span> : null}
          </header>
        ) : null}
        <div
          className={cn(
            'rounded-lg border px-3 py-2',
            interno ? 'border-private-border bg-private text-private-foreground' : 'bg-muted',
            mencionaMe && 'bg-mention text-mention-foreground',
            focado && 'animate-destaque',
          )}
        >
          <Markdown texto={texto} />
        </div>
      </div>
    </article>
  )
}
