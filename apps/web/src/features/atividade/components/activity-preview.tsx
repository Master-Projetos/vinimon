import { Link } from '@tanstack/react-router'
import { type NotificacaoDTO, textoNotificacao } from '@vinimon/shared'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ActivityPreviewProps {
  notificacao: NotificacaoDTO | undefined
}

/** Prévia do item selecionado. Até a T-10.24 (ConversaView modo="previa"), só o link para o chamado. */
export function ActivityPreview({ notificacao: n }: ActivityPreviewProps) {
  if (!n) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Selecione um item para ver os detalhes.</p>
  }
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-base font-semibold">
        #{n.chamado.id} · {n.chamado.assunto}
      </h2>
      <p className="text-sm text-muted-foreground">{textoNotificacao(n)}</p>
      <Link
        to="/chamados/$chamadoId"
        params={{ chamadoId: n.chamado.id }}
        search={n.assentamentoId ? { foco: n.assentamentoId } : {}}
        className={cn(buttonVariants({ variant: 'outline' }), 'self-start')}
      >
        Abrir chamado
      </Link>
    </div>
  )
}
