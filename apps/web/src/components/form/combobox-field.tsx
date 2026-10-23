import { Check, ChevronsUpDown, X } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ComboboxOpcao {
  valor: string
  rotulo: string
  descricao?: string
  prefixo?: ReactNode
}

export interface ComboboxFieldProps {
  valor: string | null
  aoMudar: (v: string | null) => void
  opcoes?: ComboboxOpcao[]
  buscar?: (termo: string, signal: AbortSignal) => Promise<ComboboxOpcao[]>
  placeholder?: string
  placeholderBusca?: string
  textoVazio?: string
  limpavel?: boolean
  desabilitado?: boolean
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/** Atraso entre a última tecla e a chamada de `buscar`. */
export const ATRASO_BUSCA_MS = 200

/**
 * Resultados de `buscar` enquanto o painel está aberto. Cada termo novo cancela o timer e a
 * requisição anterior (AbortSignal). A função chega por ref, então uma função nova a cada
 * render não dispara busca de novo.
 */
export function useBuscaRemota(buscar: ComboboxFieldProps['buscar'], termo: string, aberto: boolean): ComboboxOpcao[] {
  const [resultados, setResultados] = useState<ComboboxOpcao[]>([])
  const buscarRef = useRef(buscar)
  useEffect(() => {
    buscarRef.current = buscar
  }, [buscar])
  useEffect(() => {
    const funcao = buscarRef.current
    if (!funcao || !aberto) return
    const controle = new AbortController()
    const timer = window.setTimeout(() => {
      funcao(termo, controle.signal).then(
        (lista) => {
          if (!controle.signal.aborted) setResultados(lista)
        },
        () => {
          if (!controle.signal.aborted) setResultados([])
        },
      )
    }, ATRASO_BUSCA_MS)
    return () => {
      window.clearTimeout(timer)
      controle.abort()
    }
  }, [termo, aberto])
  return resultados
}

/** Abre o painel com ↓ no gatilho (padrão de combobox do WAI-ARIA); o cmdk cuida do resto. */
export function abrirComSeta(e: KeyboardEvent<HTMLElement>, aberto: boolean, abrir: () => void) {
  if (e.key === 'ArrowDown' && !aberto) {
    e.preventDefault()
    abrir()
  }
}

export function ComboboxField({
  valor,
  aoMudar,
  opcoes,
  buscar,
  placeholder = 'Selecione...',
  placeholderBusca = 'Buscar...',
  textoVazio = 'Nenhum resultado encontrado.',
  limpavel = false,
  desabilitado = false,
  id,
  'aria-invalid': invalido,
  'aria-describedby': descritoPor,
}: ComboboxFieldProps) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [escolhida, setEscolhida] = useState<ComboboxOpcao | null>(null)
  const remotas = useBuscaRemota(buscar, termo, aberto)
  const lista = buscar ? remotas : (opcoes ?? [])
  const conhecidas: ComboboxOpcao[] = [...(escolhida ? [escolhida] : []), ...(opcoes ?? []), ...remotas]
  const atual = valor === null ? undefined : conhecidas.find((o) => o.valor === valor)

  function escolher(opcao: ComboboxOpcao) {
    setEscolhida(opcao)
    aoMudar(opcao.valor)
    setAberto(false)
  }

  return (
    <div className="flex items-center gap-1">
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
            className="min-w-0 flex-1 justify-between font-normal"
          >
            {atual ? (
              <span className="flex min-w-0 items-center gap-2">
                {atual.prefixo}
                <span className="truncate">{atual.rotulo}</span>
              </span>
            ) : (
              <span className="text-muted-foreground truncate">{placeholder}</span>
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
                {lista.map((opcao) => (
                  <CommandItem
                    key={opcao.valor}
                    value={opcao.valor}
                    keywords={[opcao.rotulo]}
                    onSelect={() => escolher(opcao)}
                  >
                    {opcao.prefixo}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{opcao.rotulo}</span>
                      {opcao.descricao && (
                        <span className="text-muted-foreground truncate text-xs">{opcao.descricao}</span>
                      )}
                    </span>
                    <Check
                      className={cn('ml-auto', opcao.valor === valor ? 'opacity-100' : 'opacity-0')}
                      aria-hidden="true"
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {limpavel && valor !== null && !desabilitado && (
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Limpar seleção" onClick={() => aoMudar(null)}>
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}
