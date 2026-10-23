import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type Canal, CriarCanalSchema } from '@vinimon/shared'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { CampoForm } from '@/components/form/campo-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { canaisConsultas, useExcluirCanal, useSalvarCanal } from '@/features/canais/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
})

export const Route = createFileRoute('/_app/admin/canais')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(canaisConsultas.lista(deps)),
  component: CanaisPagina,
})

function CanaisPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(canaisConsultas.lista({ pagina, busca: search.busca }))
  const [editando, setEditando] = useState<Canal | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<Canal | null>(null)
  const excluir = useExcluirCanal()
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  async function confirmarExclusao() {
    if (!excluindo) return
    try {
      await excluir.mutateAsync(excluindo.id)
      toast.success('Canal excluído')
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível excluir o canal.')
    }
  }

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Canais
        </h1>
        <Button onClick={() => setEditando('novo')}>
          <Plus aria-hidden="true" /> Novo canal
        </Button>
      </header>

      <Table aria-label="Canais">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-24">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((c) => (
            <TableRow key={c.id} className="h-(--row-h)">
              <TableCell>{c.nome}</TableCell>
              <TableCell>{c.sistema ? 'Do sistema' : 'Cadastrado'}</TableCell>
              <TableCell>
                <Badge variant={c.ativo ? 'secondary' : 'outline'}>{c.ativo ? 'Ativo' : 'Inativo'}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Editar ${c.nome}`} onClick={() => setEditando(c)}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Excluir ${c.nome}`}
                    disabled={c.sistema}
                    title={c.sistema ? 'Canais do sistema não podem ser excluídos.' : undefined}
                    onClick={() => setExcluindo(c)}
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

      <CanalSheet canal={editando} aoFechar={() => setEditando(null)} />
      <ConfirmDialog
        aberto={excluindo !== null}
        aoMudarAberto={(aberto) => (aberto ? undefined : setExcluindo(null))}
        titulo="Excluir canal"
        descricao={`O canal ${excluindo?.nome ?? ''} será removido. Canais já usados em chamados não podem ser excluídos.`}
        rotuloConfirmar="Excluir"
        destrutivo
        aoConfirmar={confirmarExclusao}
      />
    </section>
  )
}

function CanalSheet({ canal, aoFechar }: { canal: Canal | 'novo' | null; aoFechar: () => void }) {
  const existente = canal !== null && canal !== 'novo' ? canal : null
  const salvar = useSalvarCanal(existente?.id ?? null)
  const form = useZodForm(CriarCanalSchema, {
    values: { nome: existente?.nome ?? '', ativo: existente?.ativo ?? true },
  })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(existente ? 'Canal atualizado' : 'Canal criado')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={canal !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar canal' : 'Novo canal'}</SheetTitle>
          <SheetDescription>Canal pelo qual o chamado chegou (telefone, e-mail, balcão…).</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
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
