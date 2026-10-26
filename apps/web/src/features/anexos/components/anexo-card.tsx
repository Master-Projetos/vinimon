import type { Anexo } from '@vinimon/shared'
import { Download, Eye, FileText, Image, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatarDataHora } from '@/lib/datas'
import { MIMES_COM_PREVIA } from '../queries'

export interface AnexoCardProps {
  anexo: Anexo
  podeExcluir: boolean
  aoPrevisualizar: (anexo: Anexo) => void
  aoExcluir: (anexo: Anexo) => void
}

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** Card de um anexo: nome, tamanho, quem enviou, "Baixar", prévia (só imagem) e "Excluir" (só ADMIN). */
export function AnexoCard({ anexo, podeExcluir, aoPrevisualizar, aoExcluir }: AnexoCardProps) {
  const temPrevia = MIMES_COM_PREVIA.includes(anexo.mime)
  const Icone = temPrevia ? Image : FileText
  return (
    <li className="flex flex-col gap-3 rounded-md border bg-card p-3">
      <div className="flex items-start gap-3">
        <Icone aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={anexo.nomeOriginal}>
            {anexo.nomeOriginal}
          </p>
          <p className="text-xs text-muted-foreground">
            {tamanhoLegivel(anexo.tamanho)} · {anexo.enviadoPor.nome} · {formatarDataHora(anexo.criadoEm)}
          </p>
        </div>
        {anexo.interno ? <Badge variant="secondary">Interno</Badge> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a
            href={`/api/v1/anexos/${anexo.id}`}
            download={anexo.nomeOriginal}
            aria-label={`Baixar ${anexo.nomeOriginal}`}
          >
            <Download aria-hidden="true" /> Baixar
          </a>
        </Button>
        {temPrevia ? (
          <Button type="button" variant="outline" size="sm" onClick={() => aoPrevisualizar(anexo)}>
            <Eye aria-hidden="true" /> Pré-visualizar
          </Button>
        ) : null}
        {podeExcluir ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Excluir ${anexo.nomeOriginal}`}
            onClick={() => aoExcluir(anexo)}
          >
            <Trash2 aria-hidden="true" /> Excluir
          </Button>
        ) : null}
      </div>
    </li>
  )
}
