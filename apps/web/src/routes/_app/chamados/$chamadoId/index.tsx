import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { useCallback } from 'react'
import { z } from 'zod'
import { chamadosConsultas } from '@/features/chamados/queries'
import { ConversaView } from '@/features/conversa/components/conversa-view'
import { conversaConsultas } from '@/features/conversa/queries'

const BuscaSchema = z.object({ foco: z.coerce.number().int().positive().optional() })

export const Route = createFileRoute('/_app/chamados/$chamadoId/')({
  validateSearch: BuscaSchema,
  loader: ({ context, params }) =>
    context.queryClient.ensureInfiniteQueryData(conversaConsultas.lista(params.chamadoId)),
  component: ConversaPagina,
})

function ConversaPagina() {
  const { chamadoId } = Route.useParams()
  const { foco } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { sessao } = useRouteContext({ from: '/_app' })
  const { data: detalhe } = useSuspenseQuery(chamadosConsultas.detalhe(chamadoId))
  const consumirFoco = useCallback(() => {
    void navigate({ search: (s) => ({ ...s, foco: undefined }), replace: true })
  }, [navigate])

  return (
    <ConversaView
      chamadoId={chamadoId}
      usuarioId={sessao.usuario?.id ?? 0}
      descricao={{
        texto: detalhe.descricao,
        abertoPor: detalhe.abertoPor.nome,
        solicitante: detalhe.solicitante.nome,
        abertoEm: detalhe.abertoEm,
      }}
      foco={foco}
      aoConsumirFoco={consumirFoco}
    />
  )
}
