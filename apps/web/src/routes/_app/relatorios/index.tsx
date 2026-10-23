import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/relatorios/')({
  beforeLoad: () => {
    throw redirect({ to: '/relatorios/$relatorio', params: { relatorio: 'visao-geral' }, replace: true })
  },
})
