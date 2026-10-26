import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { z } from 'zod'
import { ErrorState } from '@/components/feedback/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { NovoChamadoForm } from '@/features/chamados/components/novo-chamado-form'
import { metaConsulta } from '@/features/chamados/queries'

const NovoChamadoBuscaSchema = z.object({
  equipamento: z.string().max(40).optional(),
  problema: z.int().positive().optional(),
  pai: z.int().positive().optional(),
})

export const Route = createFileRoute('/_app/chamados/novo')({
  validateSearch: NovoChamadoBuscaSchema,
  component: NovoChamadoPagina,
})

function NovoChamadoPagina() {
  const { equipamento, problema } = Route.useSearch()
  const { sessao } = useRouteContext({ from: '/_app' })
  const meta = useQuery(metaConsulta())
  if (meta.isError) return <ErrorState erro={meta.error} aoTentarNovamente={() => void meta.refetch()} />
  if (!meta.data || !sessao.usuario) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-(--pane-px)" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  return (
    <NovoChamadoForm
      key={`${equipamento ?? ''}-${problema ?? ''}`}
      meta={meta.data}
      usuario={sessao.usuario}
      problemaInicial={problema}
      equipamento={equipamento}
    />
  )
}
