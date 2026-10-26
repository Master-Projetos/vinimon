import { useEffect } from 'react'

const PREFIXO = /^\(\d+\) /

/** Mantém "(n) " no começo do título da aba, mesmo quando cada tela troca o título (T-10.15). */
export function useContadorNoTitulo(contagem: number): void {
  useEffect(() => {
    const aplicar = () => {
      const base = document.title.replace(PREFIXO, '')
      const desejado = contagem > 0 ? `(${contagem}) ${base}` : base
      if (document.title !== desejado) document.title = desejado
    }
    aplicar()
    const alvo = document.querySelector('title')
    if (!alvo) return
    const observador = new MutationObserver(aplicar)
    observador.observe(alvo, { childList: true, characterData: true, subtree: true })
    return () => observador.disconnect()
  }, [contagem])
}
