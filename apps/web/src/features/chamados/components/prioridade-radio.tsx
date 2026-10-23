import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

export interface PrioridadeOpcao {
  id: number
  nome: string
  cor: string
}

export interface PrioridadeRadioProps {
  id: string
  opcoes: PrioridadeOpcao[]
  valor: number | undefined
  aoMudar: (prioridadeId: number) => void
  desabilitado?: boolean
  'aria-labelledby'?: string
}

/** Prioridade em pílulas (`RadioGroup`): navegável pelo teclado, com a cor de cada prioridade. */
export function PrioridadeRadio({
  id,
  opcoes,
  valor,
  aoMudar,
  desabilitado = false,
  'aria-labelledby': rotuladoPor,
}: PrioridadeRadioProps) {
  return (
    <RadioGroup
      aria-labelledby={rotuladoPor}
      value={valor === undefined ? '' : String(valor)}
      onValueChange={(v) => aoMudar(Number(v))}
      disabled={desabilitado}
      className="flex flex-wrap gap-2"
    >
      {opcoes.map((opcao) => {
        const idOpcao = `${id}-${opcao.id}`
        const marcada = opcao.id === valor
        return (
          <label
            key={opcao.id}
            htmlFor={idOpcao}
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors',
              marcada ? 'border-primary bg-accent font-medium' : 'border-input hover:bg-accent/50',
              desabilitado && 'cursor-not-allowed opacity-50',
            )}
          >
            <RadioGroupItem id={idOpcao} value={String(opcao.id)} className="sr-only" />
            <span className="size-2 rounded-full" style={{ backgroundColor: opcao.cor }} aria-hidden="true" />
            {opcao.nome}
          </label>
        )
      })}
    </RadioGroup>
  )
}
