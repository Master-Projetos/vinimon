import type { LucideIcon } from 'lucide-react'
import { Check, PlusCircle } from 'lucide-react'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export interface FacetOpcao {
  valor: string
  rotulo: string
  cor?: string
  icone?: LucideIcon
  contagem?: number
}

export interface DataTableFacetedFilterProps {
  titulo: string
  opcoes: FacetOpcao[]
  selecionados: string[]
  aoMudar: (v: string[]) => void
  /** Escolha única: marcar uma opção desmarca a anterior (marca redonda, como rádio). */
  unico?: boolean
}

/** Filtro facetado (múltipla escolha, ou única com `unico`): Popover com Command. */
export function DataTableFacetedFilter({
  titulo,
  opcoes,
  selecionados,
  aoMudar,
  unico = false,
}: DataTableFacetedFilterProps) {
  const [aberto, setAberto] = React.useState(false)

  function alternar(valor: string) {
    if (unico) {
      aoMudar(selecionados.includes(valor) ? [] : [valor])
      setAberto(false)
      return
    }
    aoMudar(selecionados.includes(valor) ? selecionados.filter((v) => v !== valor) : [...selecionados, valor])
  }
  const rotuloUnico = unico ? opcoes.find((o) => o.valor === selecionados[0])?.rotulo : undefined

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="border-dashed">
          <PlusCircle aria-hidden="true" />
          {titulo}
          {selecionados.length > 0 ? (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                {rotuloUnico ?? selecionados.length}
              </Badge>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Filtrar ${titulo.toLowerCase()}`} />
          <CommandList>
            <CommandEmpty>Nenhum resultado.</CommandEmpty>
            <CommandGroup>
              {opcoes.map((opcao) => {
                const marcado = selecionados.includes(opcao.valor)
                const Icone = opcao.icone
                return (
                  <CommandItem key={opcao.valor} value={opcao.rotulo} onSelect={() => alternar(opcao.valor)}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-4 items-center justify-center border',
                        unico ? 'rounded-full' : 'rounded-[4px]',
                        marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      )}
                    >
                      {marcado ? <Check className="size-3.5" /> : null}
                    </span>
                    {opcao.cor ? (
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: opcao.cor }}
                      />
                    ) : null}
                    {Icone ? <Icone aria-hidden="true" className="size-4 text-muted-foreground" /> : null}
                    <span>{opcao.rotulo}</span>
                    {opcao.contagem !== undefined ? (
                      <span className="ml-auto font-mono text-xs text-muted-foreground">{opcao.contagem}</span>
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {selecionados.length > 0 ? (
          <div className="border-t p-1">
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => aoMudar([])}>
              Limpar filtro
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
