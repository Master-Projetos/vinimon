import { Ban, Check, Copy, RotateCw, ServerCrash, TriangleAlert, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ErroApi } from '@/lib/api'
import { cn } from '@/lib/utils'

export interface ErrorStateProps {
  erro: unknown
  aoTentarNovamente?: () => void
  compacto?: boolean
}

interface Apresentacao {
  titulo: string
  icone: typeof Ban
}

function apresentacaoDo(status: number | undefined): Apresentacao {
  if (status === 403) return { titulo: 'Você não tem acesso a este conteúdo', icone: Ban }
  if (status === 404) return { titulo: 'Não encontrado', icone: TriangleAlert }
  if (status === 0) return { titulo: 'Sem conexão com o servidor', icone: WifiOff }
  if (status !== undefined && status >= 500) return { titulo: 'Algo deu errado do nosso lado', icone: ServerCrash }
  return { titulo: 'Não foi possível carregar este conteúdo', icone: TriangleAlert }
}

function BotaoCopiar({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void copiar()}
      aria-label="Copiar código para o suporte"
    >
      {copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copiado ? 'Copiado' : 'Copiar'}
    </Button>
  )
}

export function ErrorState({ erro, aoTentarNovamente, compacto = false }: ErrorStateProps) {
  const status = erro instanceof ErroApi ? erro.status : undefined
  const requestId = erro instanceof ErroApi ? erro.requestId : undefined
  const { titulo, icone: Icone } = apresentacaoDo(status)

  return (
    <Empty role="alert" className={cn(compacto && 'gap-3 p-4 md:p-4')}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icone aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{titulo}</EmptyTitle>
        {requestId ? (
          <EmptyDescription>
            <span>Código para o suporte: </span>
            <code className="font-mono select-all">{requestId}</code>
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {aoTentarNovamente || requestId ? (
        <EmptyContent>
          {aoTentarNovamente ? (
            <Button type="button" onClick={aoTentarNovamente}>
              <RotateCw aria-hidden="true" />
              Tentar novamente
            </Button>
          ) : null}
          {requestId ? <BotaoCopiar valor={requestId} /> : null}
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
