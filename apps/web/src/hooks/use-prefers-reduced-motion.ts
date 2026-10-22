import { useMediaQuery } from './use-media-query'

/** Verdadeiro quando o sistema pede movimento reduzido. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
