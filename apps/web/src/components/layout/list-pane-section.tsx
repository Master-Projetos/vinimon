import type { ReactNode } from 'react'

export interface ListPaneSectionProps {
  titulo?: string
  acao?: ReactNode
  children: ReactNode
}

/** Seção do painel de lista (§2.5): rótulo `text-label` em caixa-alta, ação opcional à direita. */
export function ListPaneSection({ titulo, acao, children }: ListPaneSectionProps) {
  return (
    <section className="flex flex-col gap-1 px-2 py-2">
      {titulo || acao ? (
        <div className="flex h-7 items-center justify-between gap-2 px-3">
          {titulo ? <h2 className="text-label text-muted-foreground uppercase">{titulo}</h2> : <span />}
          {acao}
        </div>
      ) : null}
      {children}
    </section>
  )
}
