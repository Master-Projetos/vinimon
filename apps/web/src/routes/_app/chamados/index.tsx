import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { ChamadosTable } from '@/features/chamados/components/chamados-table'

export const Route = createFileRoute('/_app/chamados/')({
  component: ListaPagina,
})

function ListaPagina() {
  const { sessao } = useRouteContext({ from: '/_app' })
  const busca = Route.useSearch()
  const perfil = sessao.usuario?.perfil
  if (!perfil) return null
  return <ChamadosTable busca={busca} perfil={perfil} />
}
