import { useEffect, useState } from 'react'

/** Devolve o valor só depois de ficar `ms` milissegundos sem mudar. */
export function useDebounce<T>(valor: T, ms: number): T {
  const [atrasado, setAtrasado] = useState<T>(valor)
  useEffect(() => {
    const id = window.setTimeout(() => setAtrasado(() => valor), ms)
    return () => window.clearTimeout(id)
  }, [valor, ms])
  return atrasado
}
