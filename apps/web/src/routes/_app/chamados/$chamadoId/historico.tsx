import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { HistoricoTimeline } from '@/features/historico/components/historico-timeline'
import { historicoConsulta } from '@/features/historico/queries'

export const Route = createFileRoute('/_app/chamados/$chamadoId/historico')({
  component: HistoricoDoChamado,
})

function HistoricoDoChamado() {
  const { chamadoId } = Route.useParams()
  const { data } = useSuspenseQuery(historicoConsulta(chamadoId))
  return <HistoricoTimeline eventos={data} />
}
