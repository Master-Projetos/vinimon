import { Check, Clock } from 'lucide-react'
import { Markdown } from '@/components/display/markdown'
import { UserAvatar } from '@/components/display/user-avatar'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatarHora } from '@/lib/datas'
import { cn } from '@/lib/utils'
import type { ItemConversa } from '../cache'

export interface MessageBubbleProps {
  assentamento: ItemConversa
  usuarioId: number
  /** Primeira mensagem do grupo do mesmo autor: mostra avatar, nome e hora. */
  inicioDeGrupo: boolean
  focado?: boolean
  aoTentarNovamente?: (item: ItemConversa) => void
  aoDescartar?: (clienteId: string) => void
}

/** Mensagem da conversa. Interna usa `bg-private`; menção a quem lê usa `bg-mention`. */
export function MessageBubble({
  assentamento,
  usuarioId,
  inicioDeGrupo,
  focado = false,
  aoTentarNovamente,
  aoDescartar,
}: MessageBubbleProps) {
  const { autor, texto, interno, criadoEm, id, estado, progresso, clienteId } = assentamento
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
        {estado === 'enviando' ? (
          <div className="flex w-40 flex-col gap-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock aria-hidden="true" className="size-3" /> Enviando…
            </span>
            {progresso !== undefined ? <Progress value={progresso} aria-label="Progresso dos anexos" /> : null}
          </div>
        ) : null}
        {estado === 'falhou' ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
            <span>Não enviada.</span>
            <Button type="button" variant="outline" size="xs" onClick={() => aoTentarNovamente?.(assentamento)}>
              Tentar novamente
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => clienteId && aoDescartar?.(clienteId)}>
              Descartar
            </Button>
          </div>
        ) : null}
        {estado === undefined && minha ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check aria-label="Enviada" className="size-3" />
          </span>
        ) : null}
      </div>
    </article>
  )
}
