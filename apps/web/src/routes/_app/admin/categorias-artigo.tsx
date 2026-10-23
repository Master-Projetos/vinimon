import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type CategoriaArtigo, CriarCategoriaArtigoSchema } from '@vinimon/shared'
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
import { categoriasArtigoConsultas, useSalvarCategoriaArtigo } from '@/features/categorias-artigo/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
})

export const Route = createFileRoute('/_app/admin/categorias-artigo')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(categoriasArtigoConsultas.lista(deps)),
  component: CategoriasArtigoPagina,
})

function CategoriasArtigoPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(categoriasArtigoConsultas.lista({ pagina, busca: search.busca }))
  const [editando, setEditando] = useState<CategoriaArtigo | 'nova' | null>(null)
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Categorias de artigo
        </h1>
        <Button onClick={() => setEditando('nova')}>
          <Plus aria-hidden="true" /> Nova categoria
        </Button>
      </header>

      <Table aria-label="Categorias de artigo">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Ordem</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((categoria) => (
            <TableRow key={categoria.id} className="h-(--row-h)">
              <TableCell>{categoria.nome}</TableCell>
              <TableCell>{categoria.ordem}</TableCell>
              <TableCell>
                <Badge variant={categoria.ativo ? 'secondary' : 'outline'}>
                  {categoria.ativo ? 'Ativa' : 'Inativa'}
                </Badge>
              </TableCell>
              <TableCell>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Editar ${categoria.nome}`}
                  onClick={() => setEditando(categoria)}
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

      <CategoriaArtigoSheet categoria={editando} aoFechar={() => setEditando(null)} />
    </section>
  )
}

function CategoriaArtigoSheet({
  categoria,
  aoFechar,
}: {
  categoria: CategoriaArtigo | 'nova' | null
  aoFechar: () => void
}) {
  const existente = categoria !== null && categoria !== 'nova' ? categoria : null
  const salvar = useSalvarCategoriaArtigo(existente?.id ?? null)
  const form = useZodForm(CriarCategoriaArtigoSchema, {
    values: {
      nome: existente?.nome ?? '',
      ordem: existente?.ordem ?? 0,
      ativo: existente?.ativo ?? true,
    },
  })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(existente ? 'Categoria atualizada' : 'Categoria criada')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={categoria !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar categoria de artigo' : 'Nova categoria de artigo'}</SheetTitle>
          <SheetDescription>Categorias agrupam os artigos da base de conhecimento.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
          </CampoForm>
          <CampoForm control={form.control} name="ordem" rotulo="Ordem" descricao="Use um valor entre 0 e 1000.">
            {(field, controle) => (
              <Input
                {...field}
                {...controle}
                type="number"
                inputMode="numeric"
                onChange={(e) => field.onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
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
