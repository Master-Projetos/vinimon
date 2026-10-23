import { useEffect } from 'react'

/** Atualiza o título da aba no formato "(n) Título · Vinimon"; sem "(n)" quando a contagem é 0 ou ausente. */
export function useDocumentTitle(titulo: string, contagem?: number): void {
  useEffect(() => {
    const prefixo = contagem && contagem > 0 ? `(${contagem}) ` : ''
    document.title = `${prefixo}${titulo} · Vinimon`
  }, [titulo, contagem])
}
