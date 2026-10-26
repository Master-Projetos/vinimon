import { Printer } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Etiqueta de 50×30 mm: só o diálogo é impresso; o resto da página fica invisível. */
const CSS_IMPRESSAO = `@media print {
  @page { size: 50mm 30mm; margin: 0; }
  body * { visibility: hidden !important; }
  .etiqueta-impressao, .etiqueta-impressao * { visibility: visible !important; }
  .etiqueta-impressao {
    position: fixed !important; inset: 0 !important; width: 50mm; height: 30mm; margin: 0; padding: 2mm;
    display: flex; align-items: center; gap: 2mm; background: #fff; color: #000; transform: none !important;
  }
}`

export function urlDaEtiqueta(etiqueta: string): string {
  return `${location.origin}/chamados/novo?equipamento=${encodeURIComponent(etiqueta)}`
}

export interface EtiquetaQrDialogProps {
  etiqueta: string
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
}

export function EtiquetaQrDialog({ etiqueta, aberto, aoMudarAberto }: EtiquetaQrDialogProps) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogContent className="max-w-sm">
        <style>{CSS_IMPRESSAO}</style>
        <DialogHeader data-print="ocultar">
          <DialogTitle>Etiqueta QR</DialogTitle>
          <DialogDescription>Cole no equipamento: o QR abre um novo chamado já com o ativo.</DialogDescription>
        </DialogHeader>
        <div className="etiqueta-impressao flex items-center justify-center gap-3 rounded-md border p-4">
          <QRCodeSVG value={urlDaEtiqueta(etiqueta)} size={96} level="M" title={`QR da etiqueta ${etiqueta}`} />
          <span className="text-sm font-semibold break-all">{etiqueta}</span>
        </div>
        <div data-print="ocultar" className="flex justify-end">
          <Button onClick={() => window.print()}>
            <Printer aria-hidden="true" /> Imprimir etiqueta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
