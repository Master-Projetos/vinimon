import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { MODOS_AREA_PAINEL, PERIODOS_PAINEL } from '@vinimon/shared'
import { ErrorState } from '@/components/feedback/error-state'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { metaConsultas } from '@/features/meta/queries'
import { Graficos } from '@/features/painel/components/graficos'
import { KpiGrid } from '@/features/painel/components/kpi-grid'
import { SlaProximosTable } from '@/features/painel/components/sla-proximos-table'
import { PainelBuscaSchema, painelConsultas } from '@/features/painel/queries'

export const Route = createFileRoute('/_app/painel')({
  validateSearch: PainelBuscaSchema,
  component: PainelPagina,
})

const ROTULO_MODO = { destino: 'Área de destino', origem: 'Área de origem' } as const

function PainelPagina() {
  const busca = Route.useSearch()
  const navigate = Route.useNavigate()
  const { sessao } = useRouteContext({ from: '/_app' })
  const consulta = useQuery(painelConsultas.obter(busca))
  const { data: meta } = useQuery(metaConsultas.tudo())
  const painel = consulta.data
  const reduzido = painel?.reduzido ?? sessao.usuario?.perfil === 'USUARIO'

  return (
    <section className="space-y-4 p-(--pane-px)">
      <h1 className="text-title" tabIndex={-1}>
        Painel
      </h1>
      <form
        aria-label="Filtros do painel"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="painel-periodo">Período</Label>
          <Select
            value={String(busca.periodo ?? 30)}
            onValueChange={(v) => {
              const n = Number(v)
              navigate({ search: (a) => ({ ...a, periodo: n === 7 || n === 90 ? n : undefined }) })
            }}
          >
            <SelectTrigger id="painel-periodo" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS_PAINEL.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  Últimos {p} dias
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {reduzido ? null : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="painel-area">Área</Label>
              <Select
                value={busca.area === undefined ? 'todas' : String(busca.area)}
                onValueChange={(v) =>
                  navigate({ search: (a) => ({ ...a, area: v === 'todas' ? undefined : Number(v) }) })
                }
              >
                <SelectTrigger id="painel-area" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as áreas</SelectItem>
                  {(meta?.areas ?? []).map((area) => (
                    <SelectItem key={area.id} value={String(area.id)}>
                      {area.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="painel-modo">Modo</Label>
              <Select
                value={busca.modo ?? 'destino'}
                onValueChange={(v) =>
                  navigate({ search: (a) => ({ ...a, modo: v === 'origem' ? 'origem' : undefined }) })
                }
              >
                <SelectTrigger id="painel-modo" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODOS_AREA_PAINEL.map((m) => (
                    <SelectItem key={m} value={m}>
                      {ROTULO_MODO[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </form>

      {consulta.isError && !painel ? (
        <ErrorState erro={consulta.error} aoTentarNovamente={() => consulta.refetch()} />
      ) : (
        <>
          <KpiGrid kpis={painel?.kpis} reduzido={reduzido} />
          {painel ? (
            <>
              <Graficos painel={painel} />
              <SlaProximosTable itens={painel.slaProximo} />
            </>
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </>
      )}
    </section>
  )
}
