import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound, Outlet, useRouteContext } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { ErrorState } from '@/components/feedback/error-state'
import { NotFoundState } from '@/components/feedback/not-found-state'
import { RouteTabs } from '@/components/layout/route-tabs'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ChamadoHeader } from '@/features/chamados/components/chamado-header'
import { QuickActionsRail } from '@/features/chamados/components/quick-actions-rail'
import { chamadosConsultas } from '@/features/chamados/queries'
import { useMediaQuery } from '@/hooks/use-media-query'

export const Route = createFileRoute('/_app/chamados/$chamadoId')({
  params: {
    parse: (p) => {
      const resultado = z.coerce.number().int().positive().safeParse(p.chamadoId)
      if (!resultado.success) throw notFound()
      return { chamadoId: resultado.data }
    },
  },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(chamadosConsultas.detalhe(params.chamadoId)),
  errorComponent: ({ error, reset }) => <ErrorState erro={error} aoTentarNovamente={reset} />,
  notFoundComponent: () => (
    <NotFoundState
      titulo="Chamado não encontrado"
      descricao="O número informado não é válido ou o chamado não existe."
    />
  ),
  component: ChamadoLayout,
})

function ChamadoLayout() {
  const { chamadoId } = Route.useParams()
  const { sessao } = useRouteContext({ from: '/_app' })
  const { data: detalhe } = useSuspenseQuery(chamadosConsultas.detalhe(chamadoId))
  const largo = useMediaQuery('(min-width: 1280px)')
  const [trilhoAberto, setTrilhoAberto] = useState(false)
  const usuarioId = sessao.usuario?.id ?? 0

  const abas = (
    <RouteTabs
      rotulo="Seções do chamado"
      itens={[
        { to: '/chamados/$chamadoId', params: { chamadoId }, rotulo: 'Conversa', exact: true },
        { to: '/chamados/$chamadoId/detalhes', params: { chamadoId }, rotulo: 'Detalhes' },
        { to: '/chamados/$chamadoId/anexos', params: { chamadoId }, rotulo: 'Anexos' },
      ]}
    />
  )
  const trilho = <QuickActionsRail detalhe={detalhe} usuarioId={usuarioId} />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChamadoHeader
        detalhe={detalhe}
        abas={abas}
        aoAbrirPropriedades={largo ? undefined : () => setTrilhoAberto(true)}
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
        {largo ? (
          <aside aria-label="Propriedades e ações" className="w-80 shrink-0 overflow-y-auto border-l">
            {trilho}
          </aside>
        ) : (
          <Sheet open={trilhoAberto} onOpenChange={setTrilhoAberto}>
            <SheetContent side="right" className="w-80 overflow-y-auto sm:max-w-sm">
              <SheetHeader>
                <SheetTitle>Propriedades e ações</SheetTitle>
                <SheetDescription>Altere o chamado #{detalhe.id}.</SheetDescription>
              </SheetHeader>
              {trilho}
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  )
}
