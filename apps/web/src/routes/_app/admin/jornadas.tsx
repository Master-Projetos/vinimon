import { createFileRoute } from '@tanstack/react-router'
import { Construction } from 'lucide-react'
import { EmptyState } from '@/components/feedback/empty-state'
export const Route = createFileRoute('/_app/admin/jornadas')({
  component: () => <EmptyState icone={Construction} titulo="Em construção" />,
})
