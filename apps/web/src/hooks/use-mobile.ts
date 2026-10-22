import { useMediaQuery } from './use-media-query'

/** Verdadeiro abaixo de 768 px (breakpoint `md` do design). */
export function useMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
