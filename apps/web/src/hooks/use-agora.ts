import { useEffect, useState } from 'react'

/** Devolve o instante atual e o atualiza a cada `intervaloMs` (ex.: prazos de SLA que mudam com o tempo). */
export function useAgora(intervaloMs: number): Date {
  const [agora, setAgora] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), intervaloMs)
    return () => window.clearInterval(id)
  }, [intervaloMs])
  return agora
}
