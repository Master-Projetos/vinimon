import { createFileRoute } from '@tanstack/react-router'
import { exigir } from '@/features/auth/guards'
import { ArtigoForm } from '@/features/conhecimento/components/artigo-form'

export const Route = createFileRoute('/_app/conhecimento/novo')({
  beforeLoad: ({ context }) => exigir('conhecimento.gerenciar')(context),
  component: () => <ArtigoForm />,
})
