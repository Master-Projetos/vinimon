import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { type FormEvent, Fragment, useState } from 'react'
import { z } from 'zod'
import { DateRangePicker, type IntervaloDatas } from '@/components/form/date-range-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { auditoriaConsultas } from '@/features/auditoria/queries'
import { formatarDataHora } from '@/lib/datas'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  atorId: z.int().positive().optional(),
  acao: z.string().trim().min(1).max(60).optional(),
  entidade: z.string().trim().min(1).max(60).optional(),
  de: z.iso.datetime({ offset: true }).optional(),
  ate: z.iso.datetime({ offset: true }).optional(),
})

type Busca = z.output<typeof BuscaSchema>

function consultaDe(s: Busca) {
  return {
    pagina: s.pagina ?? 1,
    atorId: s.atorId,
    acao: s.acao,
    entidade: s.entidade,
    de: s.de ? new Date(s.de) : undefined,
    ate: s.ate ? new Date(s.ate) : undefined,
  }
}

export const Route = createFileRoute('/_app/admin/auditoria')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(auditoriaConsultas.lista(consultaDe(deps))),
  component: AuditoriaPagina,
})

function AuditoriaPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(auditoriaConsultas.lista(consultaDe(search)))
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))
  const [acao, setAcao] = useState(search.acao ?? '')
  const [entidade, setEntidade] = useState(search.entidade ?? '')
  const [atorId, setAtorId] = useState(search.atorId === undefined ? '' : String(search.atorId))
  const [periodo, setPeriodo] = useState<IntervaloDatas>({
    de: search.de ? new Date(search.de) : undefined,
    ate: search.ate ? new Date(search.ate) : undefined,
  })
  const [aberta, setAberta] = useState<number | null>(null)

  function filtrar(e: FormEvent) {
    e.preventDefault()
    const ator = Number(atorId)
    navigate({
      search: {
        atorId: atorId.trim() !== '' && Number.isInteger(ator) && ator > 0 ? ator : undefined,
        acao: acao.trim() || undefined,
        entidade: entidade.trim() || undefined,
        de: periodo.de?.toISOString(),
        ate: periodo.ate?.toISOString(),
      },
    })
  }

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center">
        <h1 className="text-title" tabIndex={-1}>
          Auditoria
        </h1>
      </header>

      <form onSubmit={filtrar} aria-label="Filtros da auditoria" className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="auditoria-periodo">Período</Label>
          <div className="w-64">
            <DateRangePicker id="auditoria-periodo" valor={periodo} aoMudar={setPeriodo} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="auditoria-ator">Ator (ID)</Label>
          <Input
            id="auditoria-ator"
            type="number"
            min={1}
            className="w-28"
            value={atorId}
            onChange={(e) => setAtorId(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="auditoria-acao">Ação</Label>
          <Input
            id="auditoria-acao"
            className="w-48"
            placeholder="config.alterada"
            value={acao}
            onChange={(e) => setAcao(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="auditoria-entidade">Entidade</Label>
          <Input
            id="auditoria-entidade"
            className="w-40"
            value={entidade}
            onChange={(e) => setEntidade(e.target.value)}
          />
        </div>
        <Button type="submit">Filtrar</Button>
      </form>

      <Table aria-label="Trilha de auditoria">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <span className="sr-only">Detalhes</span>
            </TableHead>
            <TableHead>Quando</TableHead>
            <TableHead>Ator</TableHead>
            <TableHead>Ação</TableHead>
            <TableHead>Entidade</TableHead>
            <TableHead>IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((a) => {
            const expandida = aberta === a.id
            return (
              <Fragment key={a.id}>
                <TableRow className="h-(--row-h)">
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-expanded={expandida}
                      aria-label={`${expandida ? 'Ocultar' : 'Ver'} detalhes de ${a.acao} #${a.id}`}
                      onClick={() => setAberta(expandida ? null : a.id)}
                    >
                      {expandida ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                    </Button>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatarDataHora(a.criadoEm)}</TableCell>
                  <TableCell>{a.ator?.nome ?? (a.atorTipo === 'SISTEMA' ? 'Sistema' : a.atorTipo)}</TableCell>
                  <TableCell>{a.acao}</TableCell>
                  <TableCell>
                    {a.entidade}
                    {a.entidadeId ? ` #${a.entidadeId}` : ''}
                  </TableCell>
                  <TableCell>{a.ip ?? '—'}</TableCell>
                </TableRow>
                {expandida && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <pre className="bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs">
                        {JSON.stringify(a.dados, null, 2)}
                      </pre>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>

      <nav aria-label="Paginação" className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>
          Página {pagina} de {totalPaginas}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={pagina <= 1}
          onClick={() => navigate({ search: (s) => ({ ...s, pagina: pagina - 1 }) })}
        >
          Anterior
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pagina >= totalPaginas}
          onClick={() => navigate({ search: (s) => ({ ...s, pagina: pagina + 1 }) })}
        >
          Próxima
        </Button>
      </nav>
    </section>
  )
}
