import { useEstadoConexao } from '@/hooks/use-socket-evento'

/** Aviso enquanto o tempo real está desconectado. A região `role="status"` existe sempre, para o leitor de tela anunciar a mudança. */
export function OfflineIndicator() {
  const desconectado = useEstadoConexao() === 'desconectado'
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      {desconectado ? (
        <span className="rounded-md border bg-warning-soft px-3 py-1.5 text-sm text-warning-soft-foreground shadow-sm">
          Reconectando…
        </span>
      ) : null}
    </div>
  )
}
