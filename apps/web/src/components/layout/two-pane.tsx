import { PanelLeft, PanelRight } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { gravar, ler } from '@/lib/storage'
import { cn } from '@/lib/utils'

export interface TwoPaneProps {
  lista: ReactNode
  listaRotulo: string
  children: ReactNode
  modoMobile: 'lista' | 'conteudo'
  listaColapsavel?: boolean
  idPersistencia?: string
  ocultarListaAbaixoDeLg?: boolean
  direita?: ReactNode
  direitaRotulo?: string
}

const CHAVE_PAINEL = (id: string) => `painel-lista:${id}`

/**
 * Painel de lista + conteúdo (§6.2 e §2.5). Abaixo de md mostra só um dos dois, conforme `modoMobile`.
 * O recolhimento da lista (lg+) fica em `vinimon:painel-lista:<id>`; não guarda dados sensíveis.
 */
export function TwoPane({
  lista,
  listaRotulo,
  children,
  modoMobile,
  listaColapsavel = false,
  idPersistencia,
  ocultarListaAbaixoDeLg = false,
  direita,
  direitaRotulo = 'Propriedades',
}: TwoPaneProps) {
  const [recolhida, setRecolhida] = useState<boolean>(() =>
    listaColapsavel && idPersistencia ? ler(CHAVE_PAINEL(idPersistencia), false) : false,
  )

  function alternarLista() {
    const proxima = !recolhida
    setRecolhida(proxima)
    if (idPersistencia) gravar(CHAVE_PAINEL(idPersistencia), proxima)
  }

  const listaVisivel = !(listaColapsavel && recolhida)

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {listaVisivel ? (
        <aside
          aria-label={listaRotulo}
          className={cn(
            'min-h-0 w-full flex-col overflow-y-auto border-r bg-pane md:flex md:w-72 lg:w-80',
            modoMobile === 'conteudo' ? 'hidden' : 'flex',
            ocultarListaAbaixoDeLg && 'lg:hidden',
          )}
        >
          {lista}
        </aside>
      ) : null}
      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', modoMobile === 'lista' && 'hidden md:flex')}>
        {listaColapsavel ? (
          <div className="hidden px-2 pt-2 lg:block">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={alternarLista}
              aria-expanded={listaVisivel}
              aria-label={listaVisivel ? 'Ocultar lista' : 'Mostrar lista'}
            >
              <PanelLeft aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        {direita ? (
          <div className="flex justify-end px-2 pt-2 xl:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={direitaRotulo}>
                  <PanelRight aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>{direitaRotulo}</SheetTitle>
                  <SheetDescription>Dados e ações do item selecionado.</SheetDescription>
                </SheetHeader>
                {direita}
              </SheetContent>
            </Sheet>
          </div>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
      {direita ? (
        <aside
          aria-label={direitaRotulo}
          className="hidden min-h-0 w-72 flex-col overflow-y-auto border-l bg-pane xl:flex"
        >
          {direita}
        </aside>
      ) : null}
    </div>
  )
}
