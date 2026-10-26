import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CriarStatusSchema, PAPEIS_STATUS, type Status, TIPO_POR_PAPEL, TIPOS_STATUS } from '@vinimon/shared'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { StatusBadge } from '@/components/display/status-badge'
import { CampoForm } from '@/components/form/campo-form'
import { ColorField } from '@/components/form/color-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ExcluirCadastroDialog } from '@/features/admin/components/excluir-cadastro-dialog'
import { statusConsultas, useExcluirStatus, useSalvarStatus } from '@/features/status/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'
import { ROTULOS_PAPEL_STATUS, ROTULOS_TIPO_STATUS } from '@/lib/rotulos'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
})

const SEM_PAPEL = 'nenhum'

export const Route = createFileRoute('/_app/admin/status')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(statusConsultas.lista(deps)),
  component: StatusPagina,
})

function StatusPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(statusConsultas.lista({ pagina, busca: search.busca }))
  const [editando, setEditando] = useState<Status | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<Status | null>(null)
  const excluir = useExcluirStatus()
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Status
        </h1>
        <Button onClick={() => setEditando('novo')}>
          <Plus aria-hidden="true" /> Novo status
        </Button>
      </header>

      <Table aria-label="Status">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Prévia</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Papel</TableHead>
            <TableHead>Pausa o SLA</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((s) => (
            <TableRow key={s.id} className="h-(--row-h)">
              <TableCell>{s.nome}</TableCell>
              <TableCell>
                <StatusBadge nome={s.nome} cor={s.cor} />
              </TableCell>
              <TableCell>{ROTULOS_TIPO_STATUS[s.tipo]}</TableCell>
              <TableCell>{s.papel ? ROTULOS_PAPEL_STATUS[s.papel] : '—'}</TableCell>
              <TableCell>{s.pausaSla ? 'Sim' : 'Não'}</TableCell>
              <TableCell>
                <Badge variant={s.ativo ? 'secondary' : 'outline'}>{s.ativo ? 'Ativo' : 'Inativo'}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Editar ${s.nome}`} onClick={() => setEditando(s)}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Excluir ${s.nome}`}
                    disabled={s.papel !== null}
                    title={s.papel !== null ? 'Status com papel no fluxo não pode ser excluído.' : undefined}
                    onClick={() => setExcluindo(s)}
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

      <StatusSheet status={editando} aoFechar={() => setEditando(null)} />
      <ExcluirCadastroDialog
        alvo={excluindo}
        tipo="o status"
        sucesso="Status excluído"
        aviso="Status com papel no fluxo e status usados em chamados não podem ser excluídos."
        excluir={(id) => excluir.mutateAsync(id)}
        aoFechar={() => setExcluindo(null)}
      />
    </section>
  )
}

function StatusSheet({ status, aoFechar }: { status: Status | 'novo' | null; aoFechar: () => void }) {
  const existente = status !== null && status !== 'novo' ? status : null
  const salvar = useSalvarStatus(existente?.id ?? null)
  const form = useZodForm(CriarStatusSchema, {
    values: {
      nome: existente?.nome ?? '',
      tipo: existente?.tipo ?? 'ABERTO',
      papel: existente?.papel ?? null,
      cor: existente?.cor ?? '#2563eb',
      pausaSla: existente?.pausaSla ?? false,
      ignorado: existente?.ignorado ?? false,
      ordem: existente?.ordem ?? 0,
      ativo: existente?.ativo ?? true,
    },
  })
  const nome = form.watch('nome')
  const papel = form.watch('papel')
  // Com papel, só o tipo dele é válido (TIPO_POR_PAPEL); sem papel, qualquer tipo.
  const tiposValidos = papel ? [TIPO_POR_PAPEL[papel]] : TIPOS_STATUS

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(existente ? 'Status atualizado' : 'Status criado')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={status !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar status' : 'Novo status'}</SheetTitle>
          <SheetDescription>O papel define o comportamento do sistema e restringe o tipo.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
          </CampoForm>
          <CampoForm control={form.control} name="papel" rotulo="Papel" descricao="Escolher um papel ajusta o tipo.">
            {(field, controle) => (
              <Select
                value={field.value ?? SEM_PAPEL}
                onValueChange={(v) => {
                  if (v === SEM_PAPEL) {
                    field.onChange(null)
                    return
                  }
                  const novo = PAPEIS_STATUS.find((p) => p === v)
                  if (!novo) return
                  field.onChange(novo)
                  form.setValue('tipo', TIPO_POR_PAPEL[novo], { shouldValidate: true })
                }}
              >
                <SelectTrigger {...controle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_PAPEL}>Sem papel</SelectItem>
                  {PAPEIS_STATUS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {ROTULOS_PAPEL_STATUS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm control={form.control} name="tipo" rotulo="Tipo" obrigatorio>
            {(field, controle) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  const novo = TIPOS_STATUS.find((t) => t === v)
                  if (novo) field.onChange(novo)
                }}
              >
                <SelectTrigger {...controle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tiposValidos.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ROTULOS_TIPO_STATUS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm control={form.control} name="cor" rotulo="Cor" obrigatorio>
            {(field, controle) => (
              <ColorField
                id={controle.id}
                valor={field.value}
                aoMudar={field.onChange}
                aria-invalid={controle['aria-invalid']}
                textoAmostra={nome || 'Status'}
              />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="ordem" rotulo="Ordem">
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
          <CampoForm control={form.control} name="pausaSla" rotulo="Pausa o SLA">
            {(field, controle) => (
              <Switch
                id={controle.id}
                aria-describedby={controle['aria-describedby']}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="ignorado" rotulo="Ignorado nas contagens">
            {(field, controle) => (
              <Switch
                id={controle.id}
                aria-describedby={controle['aria-describedby']}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
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
