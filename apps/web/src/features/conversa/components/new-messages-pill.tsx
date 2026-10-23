import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface NewMessagesPillProps {
  quantidade: number
  aoClicar: () => void
}

/** Aparece quando chegam mensagens enquanto a pessoa lê mais acima; leva ao fim da conversa. */
export function NewMessagesPill({ quantidade, aoClicar }: NewMessagesPillProps) {
  if (quantidade <= 0) return null
  return (
    <div className="pointer-events-none sticky bottom-3 flex justify-center">
      <Button type="button" size="sm" className="pointer-events-auto shadow-md" onClick={aoClicar}>
        <ArrowDown aria-hidden="true" />
        {quantidade === 1 ? '1 nova mensagem' : `${quantidade} novas mensagens`}
      </Button>
    </div>
  )
}
