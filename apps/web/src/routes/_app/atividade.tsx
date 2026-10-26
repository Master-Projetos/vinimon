import { createFileRoute } from '@tanstack/react-router'
import { FILTROS_NOTIFICACAO } from '@vinimon/shared'
import { z } from 'zod'
import { ActivityFeed } from '@/features/atividade/components/activity-feed'

const BuscaSchema = z.object({
  filtro: z.enum(FILTROS_NOTIFICACAO).optional(),
  item: z.int().min(1).optional(),
})

export const Route = createFileRoute('/_app/atividade')({
  validateSearch: BuscaSchema,
  component: AtividadePagina,
})

function AtividadePagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <ActivityFeed
      filtro={search.filtro ?? 'todas'}
      item={search.item}
      aoMudar={(proximo) =>
        void navigate({
          search: (anterior) => ({ ...anterior, ...proximo }),
          replace: true,
        })
      }
    />
  )
}
