import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CriarTagSchema, type Tag } from '@vinimon/shared'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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
import { ExcluirCadastroDialog } from '@/features/admin/components/excluir-cadastro-dialog'
import { tagsConsultas, useExcluirTag, useSalvarTag } from '@/features/tags/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
})

export const Route = createFileRoute('/_app/admin/tags')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(tagsConsultas.lista(deps)),
  component: TagsPagina,
})

function TagsPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(tagsConsultas.lista({ pagina, busca: search.busca }))
  const [editando, setEditando] = useState<Tag | 'nova' | null>(null)
  const [excluindo, setExcluindo] = useState<Tag | null>(null)
  const excluir = useExcluirTag()
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Tags
        </h1>
        <Button onClick={() => setEditando('nova')}>
          <Plus aria-hidden="true" /> Nova tag
        </Button>
      </header>

      <Table aria-label="Tags">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((tag) => (
            <TableRow key={tag.id} className="h-(--row-h)">
              <TableCell>{tag.nome}</TableCell>
              <TableCell>
                <Badge variant={tag.ativo ? 'secondary' : 'outline'}>{tag.ativo ? 'Ativa' : 'Inativa'}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${tag.nome}`}
                    onClick={() => setEditando(tag)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Excluir ${tag.nome}`}
                    onClick={() => setExcluindo(tag)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
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

      <TagSheet tag={editando} aoFechar={() => setEditando(null)} />
      <ExcluirCadastroDialog
        alvo={excluindo}
        tipo="a tag"
        sucesso="Tag excluída"
        aviso="Tags usadas em chamados não podem ser excluídas."
        excluir={(id) => excluir.mutateAsync(id)}
        aoFechar={() => setExcluindo(null)}
      />
    </section>
  )
}

function TagSheet({ tag, aoFechar }: { tag: Tag | 'nova' | null; aoFechar: () => void }) {
  const existente = tag !== null && tag !== 'nova' ? tag : null
  const salvar = useSalvarTag(existente?.id ?? null)
  const form = useZodForm(CriarTagSchema, {
    values: {
      nome: existente?.nome ?? '',
      ativo: existente?.ativo ?? true,
    },
  })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(existente ? 'Tag atualizada' : 'Tag criada')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={tag !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar tag' : 'Nova tag'}</SheetTitle>
          <SheetDescription>Tags classificam chamados e artigos.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
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
