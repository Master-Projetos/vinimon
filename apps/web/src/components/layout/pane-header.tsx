import { Link, type LinkProps } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface PaneHeaderProps {
  titulo: ReactNode
  subtitulo?: ReactNode
  voltarPara?: LinkProps
  acoes?: ReactNode
  abaixo?: ReactNode
  nivel?: 'h1' | 'h2'
}

/**
 * Cabeçalho do conteúdo (§2.5): `h-14`, título truncado, ações e, opcionalmente, uma faixa abaixo (abas).
 * O título é focável (`tabindex="-1"`) para o `useFocoAoNavegar` mover o foco ao mudar de rota.
 */
export function PaneHeader({ titulo, subtitulo, voltarPara, acoes, abaixo, nivel = 'h1' }: PaneHeaderProps) {
  const Titulo = nivel
  return (
    <header className="flex flex-col border-b bg-background">
      <div className="flex h-14 items-center gap-2 px-(--pane-px)">
        {voltarPara ? (
          <Link
            {...voltarPara}
            aria-label="Voltar"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <Titulo tabIndex={-1} className={cn('truncate text-title focus:outline-none')}>
            {titulo}
          </Titulo>
          {subtitulo ? <p className="truncate text-sm text-muted-foreground">{subtitulo}</p> : null}
        </div>
        {acoes ? <div className="flex shrink-0 items-center gap-1">{acoes}</div> : null}
      </div>
      {abaixo ? <div className="px-(--pane-px)">{abaixo}</div> : null}
    </header>
  )
}
