import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface SenhaTemporariaDialogProps {
  /** A senha só existe aqui enquanto o diálogo está aberto: `null` fecha e remove do DOM. */
  senha: string | null
  nome: string
  aoFechar: () => void
}

/** Mostra a senha temporária uma única vez (S16). A pessoa troca no primeiro acesso. */
export function SenhaTemporariaDialog({ senha, nome, aoFechar }: SenhaTemporariaDialogProps) {
  const [copiada, setCopiada] = useState(false)

  async function copiar() {
    if (senha === null) return
    try {
      await navigator.clipboard.writeText(senha)
      setCopiada(true)
    } catch {
      setCopiada(false)
    }
  }

  return (
    <Dialog open={senha !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <DialogContent>
        {senha === null ? null : (
          <>
            <DialogHeader>
              <DialogTitle>Senha temporária</DialogTitle>
              <DialogDescription>
                Entregue esta senha a {nome}. Ela aparece só desta vez e precisa ser trocada no primeiro acesso.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
              <p className="flex-1">
                <span className="sr-only">Senha temporária: </span>
                <code className="font-mono text-base break-all select-all">{senha}</code>
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void copiar()}>
                {copiada ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copiada ? 'Copiada' : 'Copiar'}
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={aoFechar}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
