import { cn } from '@/lib/utils'
import type { Mencionavel } from '../queries'

export interface MentionPopoverProps {
  opcoes: Mencionavel[]
  indiceAtivo: number
  carregando: boolean
  aoEscolher: (pessoa: Mencionavel) => void
  aoPassarMouse: (indice: number) => void
}

/** Lista de pessoas que podem ser mencionadas; a navegação por teclado (↑↓ Enter Tab Esc) fica no campo de texto. */
export function MentionPopover({ opcoes, indiceAtivo, carregando, aoEscolher, aoPassarMouse }: MentionPopoverProps) {
  return (
    <div className="absolute bottom-full left-0 z-20 mb-1 w-72 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
      {opcoes.length === 0 ? (
        <p role="status" className="px-2 py-1.5 text-sm text-muted-foreground">
          {carregando ? 'Buscando…' : 'Ninguém encontrado'}
        </p>
      ) : (
        <ul aria-label="Pessoas para mencionar">
          {opcoes.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                tabIndex={-1}
                aria-current={i === indiceAtivo ? 'true' : undefined}
                className={cn('w-full rounded-sm px-2 py-1.5 text-left text-sm', i === indiceAtivo && 'bg-accent')}
                onMouseDown={(e) => {
                  e.preventDefault() // não tira o foco do campo
                  aoEscolher(p)
                }}
                onMouseEnter={() => aoPassarMouse(i)}
              >
                {p.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
