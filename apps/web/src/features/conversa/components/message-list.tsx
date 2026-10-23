import type { Assentamento } from '@vinimon/shared'
import { Button } from '@/components/ui/button'
import { rotuloSeparador } from '@/lib/datas'
import { MessageBubble } from './message-bubble'
import { SystemEvent } from './system-event'

/** Mensagens do mesmo autor, no mesmo tipo (pública ou interna), com até 5 min entre elas, formam um grupo. */
export const JANELA_GRUPO_MS = 5 * 60_000

export interface ItemDaLista {
  assentamento: Assentamento
  inicioDeGrupo: boolean
  /** Rótulo ("Hoje", "Ontem" ou a data) quando o dia muda em relação ao item anterior. */
  separador: string | null
}

/** Agrupa por autor e marca onde entra um separador de data. A lista chega em ordem crescente. */
export function prepararItens(itens: Assentamento[], agora: Date): ItemDaLista[] {
  let rotuloAnterior: string | null = null
  return itens.map((assentamento, i) => {
    const rotulo = rotuloSeparador(assentamento.criadoEm, agora)
    const separador = rotulo === rotuloAnterior ? null : rotulo
    rotuloAnterior = rotulo
    const anterior = itens[i - 1]
    const continua =
      separador === null &&
      anterior !== undefined &&
      assentamento.tipo === 'COMENTARIO' &&
      anterior.tipo === 'COMENTARIO' &&
      assentamento.autor !== null &&
      anterior.autor?.id === assentamento.autor.id &&
      anterior.interno === assentamento.interno &&
      assentamento.criadoEm.getTime() - anterior.criadoEm.getTime() <= JANELA_GRUPO_MS
    return { assentamento, inicioDeGrupo: !continua, separador }
  })
}

export interface MessageListProps {
  itens: Assentamento[]
  usuarioId: number
  focadoId: number | null
  temAnteriores: boolean
  carregandoAnteriores: boolean
  aoCarregarAnteriores: () => void
  agora?: Date
}

/** Lista da conversa: `role="log"`, cada mensagem num `<article>` e separadores por dia. */
export function MessageList({
  itens,
  usuarioId,
  focadoId,
  temAnteriores,
  carregandoAnteriores,
  aoCarregarAnteriores,
  agora = new Date(),
}: MessageListProps) {
  const preparados = prepararItens(itens, agora)
  return (
    <div className="flex flex-col gap-3">
      {temAnteriores ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          disabled={carregandoAnteriores}
          onClick={aoCarregarAnteriores}
        >
          {carregandoAnteriores ? 'Carregando…' : 'Carregar anteriores'}
        </Button>
      ) : null}
      <div role="log" aria-label="Mensagens do chamado" aria-live="polite" className="flex flex-col gap-3">
        {preparados.map(({ assentamento, inicioDeGrupo, separador }) => (
          <div key={assentamento.id} className="flex flex-col gap-3">
            {separador ? (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <hr aria-label={separador} className="h-px flex-1 border-0 bg-border" />
                <span aria-hidden="true">{separador}</span>
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </div>
            ) : null}
            {assentamento.tipo === 'SISTEMA' ? (
              <SystemEvent assentamento={assentamento} />
            ) : (
              <MessageBubble
                assentamento={assentamento}
                usuarioId={usuarioId}
                inicioDeGrupo={inicioDeGrupo}
                focado={focadoId === assentamento.id}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
