import { KbdShortcut } from '@/components/display/kbd-shortcut'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ATALHOS } from '@/lib/atalhos'

export interface AtalhosDialogProps {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
}

/** Lista dos atalhos de teclado (abre com `?` ou pelo menu do usuário). */
export function AtalhosDialog({ aberto, aoMudar }: AtalhosDialogProps) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
          <DialogDescription>Os atalhos de letra não funcionam enquanto você digita em um campo.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {ATALHOS.map((a) => (
            <li
              key={`${a.teclas.join('+')}-${a.descricao}`}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span>{a.descricao}</span>
              <KbdShortcut teclas={a.teclas} />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
