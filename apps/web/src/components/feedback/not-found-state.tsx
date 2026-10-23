import { FileQuestion } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

export interface NotFoundStateProps {
  titulo?: string
  descricao?: string
}

export function NotFoundState({
  titulo = 'Página não encontrada',
  descricao = 'O endereço que você abriu não existe ou foi movido.',
}: NotFoundStateProps) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestion aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{titulo}</EmptyTitle>
        <EmptyDescription>{descricao}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
