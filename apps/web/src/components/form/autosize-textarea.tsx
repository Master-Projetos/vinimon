import { type ComponentProps, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'

export interface AutosizeTextareaProps extends Omit<ComponentProps<'textarea'>, 'rows'> {
  minLinhas?: number
  maxLinhas?: number
}

/** Textarea que cresce com o conteúdo, de 1 a 10 linhas (por padrão). */
export function AutosizeTextarea({ minLinhas = 1, maxLinhas = 10, value, onChange, ...props }: AutosizeTextareaProps) {
  const [digitado, setDigitado] = useState(typeof value === 'string' ? value : '')
  const texto = typeof value === 'string' ? value : digitado
  const linhas = Math.min(maxLinhas, Math.max(minLinhas, texto.split('\n').length))
  return (
    <Textarea
      {...props}
      value={texto}
      rows={linhas}
      onChange={(evento) => {
        setDigitado(evento.target.value)
        onChange?.(evento)
      }}
    />
  )
}
