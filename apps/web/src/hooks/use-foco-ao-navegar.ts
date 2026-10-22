import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

/** Ao mudar o pathname, foca o `h1[tabindex="-1"]` do conteúdo para leitores de tela. */
export function useFocoAoNavegar(): void {
  const router = useRouter()
  useEffect(() => {
    let pathnameAtual = router.state.location.pathname
    return router.subscribe('onResolved', ({ toLocation }) => {
      if (toLocation.pathname === pathnameAtual) return
      pathnameAtual = toLocation.pathname
      document.querySelector<HTMLHeadingElement>('h1[tabindex="-1"]')?.focus()
    })
  }, [router])
}
