import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { AnexosView } from '@/features/anexos/components/anexos-view'
import { chamadosConsultas } from '@/features/chamados/queries'

export const Route = createFileRoute('/_app/chamados/$chamadoId/anexos')({
  component: AnexosDoChamado,
})

function AnexosDoChamado() {
  const { chamadoId } = Route.useParams()
  const { sessao } = useRouteContext({ from: '/_app' })
  const { data } = useSuspenseQuery(chamadosConsultas.detalhe(chamadoId))
  const perfil = sessao.usuario?.perfil
  if (!perfil) return null
  return <AnexosView detalhe={data} perfil={perfil} />
}
