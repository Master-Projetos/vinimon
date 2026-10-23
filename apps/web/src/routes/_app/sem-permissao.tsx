import { createFileRoute, Link } from '@tanstack/react-router'
import { Ban } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_app/sem-permissao')({
  component: SemPermissaoPagina,
})

function SemPermissaoPagina() {
  return (
    <EmptyState
      icone={Ban}
      titulo="Você não tem acesso a este conteúdo"
      descricao="Sua conta não tem permissão para abrir esta página. Se precisar dela, fale com a administração."
      acao={
        <Button asChild>
          <Link to="/">Voltar ao início</Link>
        </Button>
      }
    />
  )
}
