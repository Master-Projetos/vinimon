import { Search } from 'lucide-react'
import { KbdShortcut } from '@/components/display/kbd-shortcut'

export interface BuscaGlobalTriggerProps {
  aoAbrir: () => void
}

/** Botão da barra superior que abre a paleta de busca. */
export function BuscaGlobalTrigger({ aoAbrir }: BuscaGlobalTriggerProps) {
  return (
    <button
      type="button"
      aria-label="Pesquisar chamados, artigos, equipamentos e pessoas"
      onClick={aoAbrir}
      className="mx-auto flex h-8 w-8 items-center justify-center gap-2 rounded-md border bg-background text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-full sm:max-w-xl sm:justify-start sm:px-3"
    >
      <Search aria-hidden="true" className="size-4 shrink-0" />
      <span className="hidden truncate sm:inline">Pesquisar chamados, artigos, equipamentos e pessoas</span>
      <span className="hidden sm:ml-auto sm:inline-flex" aria-hidden="true">
        <KbdShortcut teclas={['mod', 'K']} />
      </span>
    </button>
  )
}
