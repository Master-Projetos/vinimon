import { useEffect, useState } from 'react'

const EVENTOS_ATIVIDADE = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const

/**
 * `true` quando a aba está oculta ou não houve entrada (mouse, teclado, toque) há `ms` milissegundos.
 * Só muda de valor nas transições, então quem reage a ele (presença) não é acionado a cada movimento do mouse.
 */
export function useOcioso(ms: number): boolean {
  const [ocioso, setOcioso] = useState(() => document.visibilityState === 'hidden')

  useEffect(() => {
    let timer: number | null = null
    const armar = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => setOcioso(true), ms)
    }
    const aoAtividade = () => {
      setOcioso(false)
      armar()
    }
    const aoVisibilidade = () => {
      if (document.visibilityState === 'hidden') {
        if (timer !== null) window.clearTimeout(timer)
        timer = null
        setOcioso(true)
      } else {
        aoAtividade()
      }
    }
    if (document.visibilityState !== 'hidden') armar()
    for (const e of EVENTOS_ATIVIDADE) window.addEventListener(e, aoAtividade, { passive: true })
    document.addEventListener('visibilitychange', aoVisibilidade)
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      for (const e of EVENTOS_ATIVIDADE) window.removeEventListener(e, aoAtividade)
      document.removeEventListener('visibilitychange', aoVisibilidade)
    }
  }, [ms])

  return ocioso
}
