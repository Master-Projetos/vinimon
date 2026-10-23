import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { ehCampoDeTexto, IR_PARA } from '@/lib/atalhos'

const JANELA_SEQUENCIA_MS = 1_000

export interface OpcoesAtalhos {
  aoAbrirBusca: () => void
  aoAbrirAtalhos: () => void
}

/**
 * Atalhos globais (§6.2). Ctrl/⌘ K vale até dentro de campos; os de letra (`g`+…, `c`, `/`, `?`) são ignorados
 * com foco em input, textarea ou área editável e com Ctrl/Alt/⌘ pressionados.
 */
export function useAtalhos({ aoAbrirBusca, aoAbrirAtalhos }: OpcoesAtalhos): void {
  const navigate = useNavigate()
  const aguardandoG = useRef<number | null>(null)

  useEffect(() => {
    const limpar = () => {
      if (aguardandoG.current !== null) window.clearTimeout(aguardandoG.current)
      aguardandoG.current = null
    }
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        limpar()
        aoAbrirBusca()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || ehCampoDeTexto(e.target)) return
      if (aguardandoG.current !== null) {
        const destino = IR_PARA.find((d) => d.tecla === e.key)
        limpar()
        if (destino) {
          e.preventDefault()
          void navigate({ to: destino.to })
        }
        return
      }
      if (e.key === 'g') {
        aguardandoG.current = window.setTimeout(limpar, JANELA_SEQUENCIA_MS)
      } else if (e.key === 'c') {
        e.preventDefault()
        void navigate({ to: '/chamados/novo' })
      } else if (e.key === '/') {
        e.preventDefault()
        aoAbrirBusca()
      } else if (e.key === '?') {
        e.preventDefault()
        aoAbrirAtalhos()
      }
    }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      limpar()
    }
  }, [aoAbrirBusca, aoAbrirAtalhos, navigate])
}
