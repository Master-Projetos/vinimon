import type { EventosServidor } from '@vinimon/shared'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { type EstadoConexao, tempoRealAtual } from '@/lib/socket'

/**
 * Escuta um evento do servidor enquanto o componente existe. O `handler` pode mudar a cada render sem reassinar.
 * `chamadoId` entra na sala do chamado (`chamado:entrar`) e volta a entrar depois de cada reconexão; sai ao desmontar.
 */
export function useSocketEvento<E extends keyof EventosServidor>(
  evento: E,
  handler: EventosServidor[E],
  opcoes: { chamadoId?: number } = {},
): void {
  const ref = useRef(handler)
  ref.current = handler
  const { chamadoId } = opcoes

  useEffect(() => {
    const tempoReal = tempoRealAtual()
    if (!tempoReal) return
    const ouvinte = (...args: Parameters<EventosServidor[E]>) => {
      Reflect.apply(ref.current, undefined, args)
    }
    const cancelarOuvinte = tempoReal.socket.ouvir(evento, ouvinte)

    let cancelarSala: (() => void) | null = null
    if (chamadoId !== undefined) {
      const entrar = () => tempoReal.socket.emitir('chamado:entrar', { chamadoId }, () => undefined)
      if (tempoReal.socket.conectado) entrar()
      const cancelarReenvio = tempoReal.registrarReenvio(entrar)
      cancelarSala = () => {
        cancelarReenvio()
        if (tempoReal.socket.conectado) tempoReal.socket.emitir('chamado:sair', { chamadoId })
      }
    }
    return () => {
      cancelarOuvinte()
      cancelarSala?.()
    }
  }, [evento, chamadoId])
}

/** Estado da conexão em tempo real (`inicial` fora do `_app`). */
export function useEstadoConexao(): EstadoConexao {
  return useSyncExternalStore(
    (aviso) => tempoRealAtual()?.assinarEstado(aviso) ?? (() => undefined),
    () => tempoRealAtual()?.estado() ?? 'inicial',
  )
}
