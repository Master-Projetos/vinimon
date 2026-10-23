import { useSyncExternalStore } from 'react'

/** Diz se a media query casa com a janela atual e acompanha mudanças (ex.: rotação do aparelho). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (aoMudar) => {
      if (typeof window.matchMedia !== 'function') return () => undefined
      const lista = window.matchMedia(query)
      lista.addEventListener('change', aoMudar)
      return () => lista.removeEventListener('change', aoMudar)
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false),
    () => false,
  )
}
