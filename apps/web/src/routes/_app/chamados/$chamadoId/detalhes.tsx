import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ChamadoDetalhes } from '@/features/chamados/components/chamado-detalhes'
import { chamadosConsultas } from '@/features/chamados/queries'

export const Route = createFileRoute('/_app/chamados/$chamadoId/detalhes')({
  component: DetalhesDoChamado,
})

function DetalhesDoChamado() {
  const { chamadoId } = Route.useParams()
  const { data } = useSuspenseQuery(chamadosConsultas.detalhe(chamadoId))
  return <ChamadoDetalhes detalhe={data} />
}
