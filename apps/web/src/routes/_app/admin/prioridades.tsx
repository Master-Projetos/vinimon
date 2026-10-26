import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CriarPrioridadeSchema, type Prioridade } from '@vinimon/shared'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { PrioridadeBadge } from '@/components/display/prioridade-badge'
import { CampoForm } from '@/components/form/campo-form'
import { ColorField } from '@/components/form/color-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ExcluirCadastroDialog } from '@/features/admin/components/excluir-cadastro-dialog'
import { prioridadesConsultas, useExcluirPrioridade, useSalvarPrioridade } from '@/features/prioridades/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
})

export const Route = createFileRoute('/_app/admin/prioridades')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(prioridadesConsultas.lista(deps)),
  component: PrioridadesPagina,
})

function minutos(valor: number | null): string {
  return valor === null ? '—' : `${valor} min`
}

function PrioridadesPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(prioridadesConsultas.lista({ pagina, busca: search.busca }))
  const [editando, setEditando] = useState<Prioridade | 'nova' | null>(null)
  const [excluindo, setExcluindo] = useState<Prioridade | null>(null)
  const excluir = useExcluirPrioridade()
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Prioridades
        </h1>
        <Button onClick={() => setEditando('nova')}>
          <Plus aria-hidden="true" /> Nova prioridade
        </Button>
      </header>

      <Table aria-label="Prioridades">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Prévia</TableHead>
            <TableHead className="text-right">Ordem</TableHead>
            <TableHead>Resposta</TableHead>
            <TableHead>Solução</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((p) => (
            <TableRow key={p.id} className="h-(--row-h)">
              <TableCell>
                {p.nome}
                {p.padrao ? <span className="ml-2 text-xs text-muted-foreground">(padrão)</span> : null}
              </TableCell>
              <TableCell>
                <PrioridadeBadge nome={p.nome} cor={p.cor} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{p.ordem}</TableCell>
              <TableCell>{minutos(p.slaRespostaMin)}</TableCell>
              <TableCell>{minutos(p.slaSolucaoMin)}</TableCell>
              <TableCell>
                <Badge variant={p.ativo ? 'secondary' : 'outline'}>{p.ativo ? 'Ativa' : 'Inativa'}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Editar ${p.nome}`} onClick={() => setEditando(p)}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Excluir ${p.nome}`}
                    disabled={p.padrao}
                    title={p.padrao ? 'A prioridade padrão não pode ser excluída.' : undefined}
                    onClick={() => setExcluindo(p)}
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

      <PrioridadeSheet prioridade={editando} aoFechar={() => setEditando(null)} />
      <ExcluirCadastroDialog
        alvo={excluindo}
        tipo="a prioridade"
        sucesso="Prioridade excluída"
        aviso="A prioridade padrão e as prioridades usadas em chamados não podem ser excluídas."
        excluir={(id) => excluir.mutateAsync(id)}
        aoFechar={() => setExcluindo(null)}
      />
    </section>
  )
}

function numeroOuNulo(texto: string): number | null {
  return texto.trim() === '' ? null : Number(texto)
}

function PrioridadeSheet({ prioridade, aoFechar }: { prioridade: Prioridade | 'nova' | null; aoFechar: () => void }) {
  const existente = prioridade !== null && prioridade !== 'nova' ? prioridade : null
  const salvar = useSalvarPrioridade(existente?.id ?? null)
  const form = useZodForm(CriarPrioridadeSchema, {
    values: {
      nome: existente?.nome ?? '',
      cor: existente?.cor ?? '#2563eb',
      ordem: existente?.ordem ?? 0,
      padrao: existente?.padrao ?? false,
      slaRespostaMin: existente?.slaRespostaMin ?? null,
      slaSolucaoMin: existente?.slaSolucaoMin ?? null,
      ativo: existente?.ativo ?? true,
    },
  })
  const nome = form.watch('nome')

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(existente ? 'Prioridade atualizada' : 'Prioridade criada')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={prioridade !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar prioridade' : 'Nova prioridade'}</SheetTitle>
          <SheetDescription>Os prazos de SLA são em minutos corridos; vazio não define prazo.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
          </CampoForm>
          <CampoForm control={form.control} name="cor" rotulo="Cor" obrigatorio>
            {(field, controle) => (
              <ColorField
                id={controle.id}
                valor={field.value}
                aoMudar={field.onChange}
                aria-invalid={controle['aria-invalid']}
                textoAmostra={nome || 'Prioridade'}
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
          <CampoForm control={form.control} name="slaRespostaMin" rotulo="Prazo de resposta (min)">
            {(field, controle) => (
              <Input
                {...field}
                {...controle}
                type="number"
                inputMode="numeric"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(numeroOuNulo(e.target.value))}
              />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="slaSolucaoMin" rotulo="Prazo de solução (min)">
            {(field, controle) => (
              <Input
                {...field}
                {...controle}
                type="number"
                inputMode="numeric"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(numeroOuNulo(e.target.value))}
              />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="padrao" rotulo="Prioridade padrão">
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
