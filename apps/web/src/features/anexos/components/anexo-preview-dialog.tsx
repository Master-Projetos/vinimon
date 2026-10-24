import type { Anexo } from '@vinimon/shared'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export interface AnexoPreviewDialogProps {
  anexo: Anexo | null
  aoFechar: () => void
}

/** Prévia só de imagem, por `<img>` (nunca iframe, embed nem object: S70). */
export function AnexoPreviewDialog({ anexo, aoFechar }: AnexoPreviewDialogProps) {
  return (
    <Dialog open={anexo !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{anexo?.nomeOriginal}</DialogTitle>
          <DialogDescription>Pré-visualização da imagem anexada.</DialogDescription>
        </DialogHeader>
        {anexo ? (
          <img
            src={`/api/v1/anexos/${anexo.id}`}
            alt={anexo.nomeOriginal}
            loading="lazy"
            className="max-h-[70vh] w-full object-contain"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
