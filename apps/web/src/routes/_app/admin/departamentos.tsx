import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CriarDepartamentoSchema, type Departamento } from '@vinimon/shared'
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
import { departamentosConsultas, useSalvarDepartamento } from '@/features/departamentos/queries'
import { metaConsultas } from '@/features/meta/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
  unidadeId: z.int().positive().optional(),
})

const TODAS = 'todas'

export const Route = createFileRoute('/_app/admin/departamentos')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca, unidadeId: search.unidadeId }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(departamentosConsultas.lista(deps)),
      context.queryClient.ensureQueryData(metaConsultas.tudo()),
    ])
  },
  component: DepartamentosPagina,
})

function DepartamentosPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(
    departamentosConsultas.lista({ pagina, busca: search.busca, unidadeId: search.unidadeId }),
  )
  const { data: meta } = useSuspenseQuery(metaConsultas.tudo())
  const [editando, setEditando] = useState<Departamento | 'novo' | null>(null)
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Departamentos
        </h1>
        <Button onClick={() => setEditando('novo')}>
          <Plus aria-hidden="true" /> Novo departamento
        </Button>
      </header>

      <Select
        value={search.unidadeId === undefined ? TODAS : String(search.unidadeId)}
        onValueChange={(v) =>
          navigate({ search: (s) => ({ ...s, unidadeId: v === TODAS ? undefined : Number(v), pagina: undefined }) })
        }
      >
        <SelectTrigger aria-label="Filtrar por unidade" className="w-60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todas as unidades</SelectItem>
          {meta.unidades.map((u) => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Table aria-label="Departamentos">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Unidade</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((departamento) => (
            <TableRow key={departamento.id} className="h-(--row-h)">
              <TableCell>{departamento.nome}</TableCell>
              <TableCell>{departamento.unidade.nome}</TableCell>
              <TableCell>
                <Badge variant={departamento.ativo ? 'secondary' : 'outline'}>
                  {departamento.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              </TableCell>
              <TableCell>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Editar ${departamento.nome}`}
                  onClick={() => setEditando(departamento)}
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

      <DepartamentoSheet departamento={editando} aoFechar={() => setEditando(null)} />
    </section>
  )
}

function DepartamentoSheet({
  departamento,
  aoFechar,
}: {
  departamento: Departamento | 'novo' | null
  aoFechar: () => void
}) {
  const existente = departamento !== null && departamento !== 'novo' ? departamento : null
  const { data: meta } = useSuspenseQuery(metaConsultas.tudo())
  const salvar = useSalvarDepartamento(existente?.id ?? null)
  const form = useZodForm(CriarDepartamentoSchema, {
    values: {
      nome: existente?.nome ?? '',
      unidadeId: existente?.unidadeId ?? meta.unidades[0]?.id ?? 0,
      ativo: existente?.ativo ?? true,
    },
  })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(existente ? 'Departamento atualizado' : 'Departamento criado')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={departamento !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar departamento' : 'Novo departamento'}</SheetTitle>
          <SheetDescription>Cada departamento pertence a uma unidade.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
          </CampoForm>
          <CampoForm control={form.control} name="unidadeId" rotulo="Unidade" obrigatorio>
            {(field, controle) => (
              <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                <SelectTrigger {...controle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meta.unidades.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm control={form.control} name="ativo" rotulo="Ativo">
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
