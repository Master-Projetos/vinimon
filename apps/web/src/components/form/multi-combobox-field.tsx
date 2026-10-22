import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { abrirComSeta, type ComboboxFieldProps, type ComboboxOpcao, useBuscaRemota } from './combobox-field'

export interface MultiComboboxFieldProps extends Omit<ComboboxFieldProps, 'valor' | 'aoMudar' | 'limpavel'> {
  valores: string[]
  aoMudar: (v: string[]) => void
  maxVisiveis?: number
}

/** Seleção múltipla com chips removíveis. Os chips além de `maxVisiveis` viram "+N". */
export function MultiComboboxField({
  valores,
  aoMudar,
  opcoes,
  buscar,
  placeholder = 'Selecione...',
  placeholderBusca = 'Buscar...',
  textoVazio = 'Nenhum resultado encontrado.',
  desabilitado = false,
  id,
  maxVisiveis = 5,
  'aria-invalid': invalido,
  'aria-describedby': descritoPor,
}: MultiComboboxFieldProps) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [memoria, setMemoria] = useState<ComboboxOpcao[]>([])
  const remotas = useBuscaRemota(buscar, termo, aberto)
  const lista = buscar ? remotas : (opcoes ?? [])
  const conhecidas: ComboboxOpcao[] = [...memoria, ...(opcoes ?? []), ...remotas]
  const rotuloDe = (v: string) => conhecidas.find((o) => o.valor === v)?.rotulo ?? v

  function alternar(opcao: ComboboxOpcao) {
    setMemoria((atual) => [...atual, opcao])
    aoMudar(valores.includes(opcao.valor) ? valores.filter((v) => v !== opcao.valor) : [...valores, opcao.valor])
  }

  const visiveis = valores.slice(0, maxVisiveis)
  const ocultos = valores.length - visiveis.length

  return (
    <div className="space-y-2">
      <Popover
        open={aberto}
        onOpenChange={(proximo) => {
          setAberto(proximo)
          if (!proximo) setTermo('')
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            role="combobox"
            variant="outline"
            aria-haspopup="listbox"
            aria-expanded={aberto}
            aria-invalid={invalido}
            aria-describedby={descritoPor}
            disabled={desabilitado}
            onKeyDown={(e) => abrirComSeta(e, aberto, () => setAberto(true))}
            className="w-full justify-between font-normal"
          >
            {valores.length === 0 ? (
              <span className="text-muted-foreground truncate">{placeholder}</span>
            ) : (
              <span className="truncate">
                {valores.length === 1 ? '1 selecionado' : `${valores.length} selecionados`}
              </span>
            )}
            <ChevronsUpDown className="opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={!buscar}>
            <CommandInput placeholder={placeholderBusca} onValueChange={setTermo} />
            <CommandList>
              <CommandEmpty>{textoVazio}</CommandEmpty>
              <CommandGroup>
                {lista.map((opcao) => {
                  const marcada = valores.includes(opcao.valor)
                  return (
                    <CommandItem
                      key={opcao.valor}
                      value={opcao.valor}
                      keywords={[opcao.rotulo]}
                      onSelect={() => alternar(opcao)}
                    >
                      {opcao.prefixo}
                      <span className="truncate">{opcao.rotulo}</span>
                      <Check className={cn('ml-auto', marcada ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {valores.length > 0 && (
        <ul aria-label="Selecionados" className="flex flex-wrap gap-1.5">
          {visiveis.map((v) => {
            const rotulo = rotuloDe(v)
            return (
              <li
                key={v}
                className="bg-secondary text-secondary-foreground flex items-center gap-0.5 rounded-md py-0.5 pr-0.5 pl-2 text-sm"
              >
                <span>{rotulo}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remover ${rotulo}`}
                  disabled={desabilitado}
                  onClick={() => aoMudar(valores.filter((x) => x !== v))}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            )
          })}
          {ocultos > 0 && <li className="text-muted-foreground px-2 py-0.5 text-sm">+{ocultos}</li>}
        </ul>
      )}
    </div>
  )
}
