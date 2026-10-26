import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'
import { ErrorState } from '@/components/feedback/error-state'
import { NotFoundState } from '@/components/feedback/not-found-state'
import { exigir } from '@/features/auth/guards'
import { ArtigoForm } from '@/features/conhecimento/components/artigo-form'
import { artigosConsultas } from '@/features/conhecimento/queries'

export const Route = createFileRoute('/_app/conhecimento/$artigoId/editar')({
  params: {
    parse: (p) => {
      const resultado = z.coerce.number().int().positive().safeParse(p.artigoId)
      if (!resultado.success) throw notFound()
      return { artigoId: resultado.data }
    },
  },
  beforeLoad: ({ context }) => exigir('conhecimento.gerenciar')(context),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(artigosConsultas.detalhe(params.artigoId)),
  errorComponent: ({ error, reset }) => <ErrorState erro={error} aoTentarNovamente={reset} />,
  notFoundComponent: () => (
    <NotFoundState titulo="Artigo não encontrado" descricao="O endereço não é válido ou o artigo não existe." />
  ),
  component: EditarPagina,
})

function EditarPagina() {
  const { artigoId } = Route.useParams()
  const { data } = useSuspenseQuery(artigosConsultas.detalhe(artigoId))
  return <ArtigoForm artigo={data} />
}
