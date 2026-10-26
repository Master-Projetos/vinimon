import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ErrorState } from '@/components/feedback/error-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { UsuariosAreaTable } from '@/features/areas-geridas/components/usuarios-area-table'
import { areasGeridasConsultas } from '@/features/areas-geridas/queries'
import { metaConsultas } from '@/features/meta/queries'

const BuscaSchema = z.object({ area: z.int().positive().optional() })

export const Route = createFileRoute('/_app/areas-geridas')({
  validateSearch: BuscaSchema,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(metaConsultas.tudo())
  },
  component: AreasGeridasPagina,
})

function AreasGeridasPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: meta } = useSuspenseQuery(metaConsultas.tudo())
  const areaId = search.area ?? meta.areas[0]?.id
  // A API responde 404 para área que o usuário não gerencia; o ErrorState explica.
  const usuarios = useQuery({ ...areasGeridasConsultas.usuarios(areaId ?? 0), enabled: areaId !== undefined })

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Áreas geridas
        </h1>
        <Select
          value={areaId === undefined ? '' : String(areaId)}
          onValueChange={(v) => void navigate({ search: { area: Number(v) } })}
        >
          <SelectTrigger aria-label="Área" className="w-56">
            <SelectValue placeholder="Escolha a área" />
          </SelectTrigger>
          <SelectContent>
            {meta.areas.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>
      {areaId === undefined ? null : usuarios.isError ? (
        <ErrorState erro={usuarios.error} aoTentarNovamente={() => void usuarios.refetch()} />
      ) : usuarios.isPending ? (
        <Skeleton role="status" aria-label="Carregando usuários" className="h-40 w-full" />
      ) : (
        <UsuariosAreaTable areaId={areaId} />
      )}
    </section>
  )
}
