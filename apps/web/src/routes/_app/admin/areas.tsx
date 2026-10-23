import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type Area, CriarAreaSchema } from '@vinimon/shared'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { areasConsultas, useSalvarArea } from '@/features/areas/queries'
import { metaConsultas } from '@/features/meta/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
})

export const Route = createFileRoute('/_app/admin/areas')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(areasConsultas.lista(deps)),
  component: AreasPagina,
})

function AreasPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(areasConsultas.lista({ pagina, busca: search.busca }))
  const [editando, setEditando] = useState<Area | 'nova' | null>(null)
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Áreas
        </h1>
        <Button onClick={() => setEditando('nova')}>
          <Plus aria-hidden="true" /> Nova área
        </Button>
      </header>

      <Table aria-label="Áreas">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Atende chamados</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((area) => (
            <TableRow key={area.id} className="h-(--row-h)">
              <TableCell>{area.nome}</TableCell>
              <TableCell>{area.atende ? 'Sim' : 'Não'}</TableCell>
              <TableCell>
                <Badge variant={area.ativo ? 'secondary' : 'outline'}>{area.ativo ? 'Ativa' : 'Inativa'}</Badge>
              </TableCell>
              <TableCell>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Editar ${area.nome}`}
                  onClick={() => setEditando(area)}
                >
                  <Pencil aria-hidden="true" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
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

      <AreaSheet area={editando} aoFechar={() => setEditando(null)} />
    </section>
  )
}

function AreaSheet({ area, aoFechar }: { area: Area | 'nova' | null; aoFechar: () => void }) {
  const existente = area !== null && area !== 'nova' ? area : null
  const { data: meta } = useSuspenseQuery(metaConsultas.tudo())
  const salvar = useSalvarArea(existente?.id ?? null)
  const form = useZodForm(CriarAreaSchema, {
    values: {
      nome: existente?.nome ?? '',
      atende: existente?.atende ?? true,
      ativo: existente?.ativo ?? true,
      jornadaId: existente?.jornadaId ?? null,
    },
  })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(existente ? 'Área atualizada' : 'Área criada')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={area !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar área' : 'Nova área'}</SheetTitle>
          <SheetDescription>Áreas que atendem recebem chamados na fila.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
          </CampoForm>
          <CampoForm
            control={form.control}
            name="jornadaId"
            rotulo="Jornada de SLA"
            descricao="Vazio usa a jornada padrão."
          >
            {(field, controle) => (
              <Select
                value={field.value === null ? 'padrao' : String(field.value)}
                onValueChange={(v) => field.onChange(v === 'padrao' ? null : Number(v))}
              >
                <SelectTrigger {...controle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="padrao">Jornada padrão</SelectItem>
                  {meta.jornadas.map((j) => (
                    <SelectItem key={j.id} value={String(j.id)}>
                      {j.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm control={form.control} name="atende" rotulo="Atende chamados">
            {(field, controle) => (
              <Switch
                id={controle.id}
                aria-describedby={controle['aria-describedby']}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="ativo" rotulo="Ativa">
            {(field, controle) => (
              <Switch
                id={controle.id}
                aria-describedby={controle['aria-describedby']}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          </CampoForm>
          <SheetFooter className="px-0">
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting || salvar.isPending}>
              Salvar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
