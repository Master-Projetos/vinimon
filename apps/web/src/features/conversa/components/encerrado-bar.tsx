import type { ChamadoDetalhe } from '@vinimon/shared'
import { Lock } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ReabrirDialog } from '@/features/chamados/components/reabrir-dialog'
import { formatarDataHora } from '@/lib/datas'
import { ROTULOS_NOTA_AVALIACAO } from '@/lib/rotulos'

export interface EncerradoBarProps {
  detalhe: ChamadoDetalhe
}

/** Barra "Encerrado em … [Reabrir]"; o botão só aparece para quem pode reabrir (`acoes.reabrir`). */
export function EncerradoBar({ detalhe }: EncerradoBarProps) {
  const [reabrindo, setReabrindo] = useState(false)
  const quando = detalhe.encerradoEm
  if (!quando) return null
  const avaliacao = detalhe.avaliacao
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted px-4 py-3 text-sm"
    >
      <span className="flex items-center gap-2">
        <Lock aria-hidden="true" className="size-4 text-muted-foreground" />
        {detalhe.cancelado ? 'Cancelado' : 'Encerrado'} em {formatarDataHora(quando)}
        {avaliacao ? (
          <span className="text-muted-foreground">
            · Avaliação: {ROTULOS_NOTA_AVALIACAO[avaliacao.nota]}
            {avaliacao.automatica ? ' (automática)' : ''}
          </span>
        ) : null}
      </span>
      {detalhe.acoes.reabrir ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setReabrindo(true)}>
            Reabrir
          </Button>
          <ReabrirDialog detalhe={detalhe} aberto={reabrindo} aoMudarAberto={setReabrindo} />
        </>
      ) : null}
    </div>
  )
}
