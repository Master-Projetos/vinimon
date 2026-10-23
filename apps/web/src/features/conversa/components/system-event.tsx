import type { Assentamento } from '@vinimon/shared'
import { formatarHora } from '@/lib/datas'

/** Evento do sistema (mudança de status, encaminhamento…): linha centralizada, sem avatar. */
export function SystemEvent({ assentamento }: { assentamento: Assentamento }) {
  return (
    <article
      data-assentamento-id={assentamento.id}
      aria-label="Evento do sistema"
      className="mx-auto max-w-prose rounded-md px-3 py-1 text-center text-xs text-muted-foreground"
    >
      {assentamento.texto} <span className="tabular-nums">· {formatarHora(assentamento.criadoEm)}</span>
    </article>
  )
}
