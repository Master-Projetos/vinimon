import type { ChamadoDetalhe } from '@vinimon/shared'
import { CircleCheck } from 'lucide-react'
import { Markdown } from '@/components/display/markdown'
import { formatarDataHora } from '@/lib/datas'

export interface SolucaoCardProps {
  detalhe: ChamadoDetalhe
}

/** Solução registrada ao concluir o chamado, para quem acompanha ler antes de validar. */
export function SolucaoCard({ detalhe }: SolucaoCardProps) {
  if (!detalhe.solucao) return null
  return (
    <section
      aria-label="Solução do chamado"
      className="rounded-lg border border-success-soft-foreground/20 bg-success-soft p-4 text-success-soft-foreground"
    >
      <header className="mb-2 flex items-center gap-2 text-sm font-medium">
        <CircleCheck aria-hidden="true" className="size-4" />
        Solução
        {detalhe.concluidoEm ? (
          <span className="text-xs font-normal">
            · {detalhe.operador ? `${detalhe.operador.nome}, ` : ''}
            {formatarDataHora(detalhe.concluidoEm)}
          </span>
        ) : null}
      </header>
      <Markdown texto={detalhe.solucao} />
    </section>
  )
}
