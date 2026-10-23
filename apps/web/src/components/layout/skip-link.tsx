import type { MouseEvent } from 'react'

export interface SkipLinkProps {
  alvo?: string
}

// Primeiro elemento focável da página (§6.2): aparece só com foco e leva ao conteúdo principal.
export function SkipLink({ alvo = '#conteudo' }: SkipLinkProps) {
  const aoClicar = (evento: MouseEvent<HTMLAnchorElement>) => {
    const destino = document.getElementById(alvo.replace(/^#/, ''))
    if (!destino) return
    evento.preventDefault()
    destino.focus()
  }

  return (
    <a
      href={alvo}
      onClick={aoClicar}
      className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Pular para o conteúdo
    </a>
  )
}
