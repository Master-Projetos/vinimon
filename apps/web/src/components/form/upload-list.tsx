import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export interface ItemUpload {
  id: string
  nome: string
  progresso: number
  erro?: string
}

export interface UploadListProps {
  itens: ItemUpload[]
  aoRemover: (id: string) => void
  rotulo?: string
}

/** Lista de arquivos com progresso e botão de remover. */
export function UploadList({ itens, aoRemover, rotulo = 'Arquivos enviados' }: UploadListProps) {
  if (itens.length === 0) return null
  return (
    <ul aria-label={rotulo} className="flex flex-col gap-2">
      {itens.map((item) => {
        const concluido = item.progresso >= 100 && item.erro === undefined
        const idStatus = `${item.id}-status`
        const status = item.erro ?? (concluido ? 'Enviado' : `Enviando... ${item.progresso}%`)
        return (
          <li key={item.id} className="flex flex-col gap-1 rounded-md border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm">{item.nome}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remover ${item.nome}`}
                onClick={() => aoRemover(item.id)}
              >
                Remover
              </Button>
            </div>
            <Progress value={item.progresso} aria-label={`Progresso de ${item.nome}`} aria-describedby={idStatus} />
            <span id={idStatus} className={item.erro ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {status}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
