import { useId, useState } from 'react'
import { type Accept, type FileRejection, useDropzone } from 'react-dropzone'
import { cn } from '@/lib/utils'

/** Tamanho em MB ou KB, para as mensagens de limite. */
export const formatarTamanho = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${Number((bytes / (1024 * 1024)).toFixed(1))} MB` : `${Math.round(bytes / 1024)} KB`

export interface FileDropzoneProps {
  rotulo: string
  aceitar: Accept
  tamanhoMaximo: number
  maxArquivos: number
  quantidadeAtual?: number
  desabilitado?: boolean
  aoAdicionar: (arquivos: File[]) => void
}

const mensagemRejeicao = (rejeicao: FileRejection, tamanhoMaximo: number, maxArquivos: number): string[] =>
  rejeicao.errors.map((erro) => {
    switch (erro.code) {
      case 'file-invalid-type':
        return `${rejeicao.file.name}: tipo de arquivo não aceito.`
      case 'file-too-large':
        return `${rejeicao.file.name}: passa do limite de ${formatarTamanho(tamanhoMaximo)}.`
      case 'too-many-files':
        return `Máximo de ${maxArquivos} arquivos.`
      default:
        return `${rejeicao.file.name}: arquivo não aceito.`
    }
  })

/** Área de upload: arrastar, clicar, escolher ou colar imagem (Ctrl+V). Rejeições aparecem inline. */
export function FileDropzone({
  rotulo,
  aceitar,
  tamanhoMaximo,
  maxArquivos,
  quantidadeAtual = 0,
  desabilitado = false,
  aoAdicionar,
}: FileDropzoneProps) {
  const idDescricao = useId()
  const [rejeicoes, setRejeicoes] = useState<string[]>([])
  const vagas = Math.max(0, maxArquivos - quantidadeAtual)
  const cheio = vagas === 0

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: aceitar,
    maxSize: tamanhoMaximo,
    maxFiles: vagas,
    disabled: desabilitado || cheio,
    onDrop: (aceitos, rejeitados) => {
      setRejeicoes(rejeitados.flatMap((r) => mensagemRejeicao(r, tamanhoMaximo, maxArquivos)))
      if (aceitos.length > 0) aoAdicionar(aceitos)
    },
  })

  return (
    <div className="flex flex-col gap-2">
      <div
        {...getRootProps({
          role: 'button',
          'aria-label': rotulo,
          'aria-describedby': idDescricao,
          'aria-disabled': desabilitado || cheio,
          className: cn(
            'flex flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
            isDragActive && 'border-primary bg-primary/5',
            (desabilitado || cheio) && 'pointer-events-none opacity-50',
          ),
        })}
      >
        <input {...getInputProps()} />
        <p>
          Arraste arquivos, cole uma imagem (Ctrl+V) ou <span className="underline">escolha no computador</span>.
        </p>
        <p id={idDescricao} className="text-xs text-muted-foreground">
          {cheio
            ? `Limite de ${maxArquivos} arquivos atingido.`
            : `Até ${vagas} arquivo(s) de ${formatarTamanho(tamanhoMaximo)} cada.`}
        </p>
      </div>
      {rejeicoes.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          {rejeicoes.map((mensagem) => (
            <li key={mensagem}>{mensagem}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
