import { useCallback, useEffect, useRef, useState } from 'react'

const TEMPO_COPIADO_MS = 2000

/** Copia texto para a área de transferência e marca `copiado` por um tempo curto. */
export function useCopiar() {
  const [copiado, setCopiado] = useState(false)
  const timeoutRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => window.clearTimeout(timeoutRef.current)
  }, [])

  const copiar = useCallback(async (texto: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      setCopiado(false)
      return false
    }
    setCopiado(true)
    window.clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => setCopiado(false), TEMPO_COPIADO_MS)
    return true
  }, [])

  return { copiado, copiar }
}
