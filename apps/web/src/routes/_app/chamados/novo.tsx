import { createFileRoute } from '@tanstack/react-router'
import { Construction } from 'lucide-react'
import { z } from 'zod'
import { EmptyState } from '@/components/feedback/empty-state'

const NovoChamadoBuscaSchema = z.object({
  equipamento: z.string().max(40).optional(),
  problema: z.int().positive().optional(),
  pai: z.int().positive().optional(),
})

export const Route = createFileRoute('/_app/chamados/novo')({
  validateSearch: NovoChamadoBuscaSchema,
  component: () => <EmptyState icone={Construction} titulo="Em construção" />,
})
