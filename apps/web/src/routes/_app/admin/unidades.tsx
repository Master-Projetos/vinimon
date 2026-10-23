import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CriarUnidadeSchema, type Unidade } from '@vinimon/shared'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { unidadesConsultas, useSalvarUnidade } from '@/features/unidades/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
})

export const Route = createFileRoute('/_app/admin/unidades')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(unidadesConsultas.lista(deps)),
  component: UnidadesPagina,
})

function UnidadesPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(unidadesConsultas.lista({ pagina, busca: search.busca }))
  const [editando, setEditando] = useState<Unidade | 'nova' | null>(null)
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Unidades
        </h1>
        <Button onClick={() => setEditando('nova')}>
          <Plus aria-hidden="true" /> Nova unidade
        </Button>
      </header>

      <Table aria-label="Unidades">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Endereço</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((unidade) => (
            <TableRow key={unidade.id} className="h-(--row-h)">
              <TableCell>{unidade.nome}</TableCell>
              <TableCell>{unidade.endereco ?? '—'}</TableCell>
              <TableCell>
                <Badge variant={unidade.ativo ? 'secondary' : 'outline'}>{unidade.ativo ? 'Ativa' : 'Inativa'}</Badge>
              </TableCell>
              <TableCell>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Editar ${unidade.nome}`}
                  onClick={() => setEditando(unidade)}
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

      <UnidadeSheet unidade={editando} aoFechar={() => setEditando(null)} />
    </section>
  )
}

function UnidadeSheet({ unidade, aoFechar }: { unidade: Unidade | 'nova' | null; aoFechar: () => void }) {
  const existente = unidade !== null && unidade !== 'nova' ? unidade : null
  const salvar = useSalvarUnidade(existente?.id ?? null)
  const form = useZodForm(CriarUnidadeSchema, {
    values: {
      nome: existente?.nome ?? '',
      endereco: existente?.endereco ?? null,
      ativo: existente?.ativo ?? true,
    },
  })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(existente ? 'Unidade atualizada' : 'Unidade criada')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={unidade !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar unidade' : 'Nova unidade'}</SheetTitle>
          <SheetDescription>Unidades agrupam os departamentos.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
          </CampoForm>
          <CampoForm control={form.control} name="endereco" rotulo="Endereço">
            {(field, controle) => (
              <Input
                {...field}
                {...controle}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                autoComplete="off"
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
