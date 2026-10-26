import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CriarFeriadoSchema, type Feriado } from '@vinimon/shared'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { camposNoFuso, DatePicker, instanteNoFuso } from '@/components/form/date-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ExcluirCadastroDialog } from '@/features/admin/components/excluir-cadastro-dialog'
import { feriadosConsultas, useExcluirFeriado, useSalvarFeriado } from '@/features/feriados/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  ano: z.int().min(1900).max(2999).optional(),
})

export const Route = createFileRoute('/_app/admin/feriados')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, ano: search.ano }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(feriadosConsultas.lista(deps)),
  component: FeriadosPagina,
})

/** 'AAAA-MM-DD' → instante à meia-noite no fuso padrão (para o DatePicker). */
function dataParaInstante(data: string): Date | null {
  const [ano, mes, dia] = data.split('-').map(Number)
  if (!ano || !mes || !dia) return null
  return instanteNoFuso({ ano, mes, dia, hora: 0, minuto: 0 })
}

function instanteParaData(d: Date): string {
  const c = camposNoFuso(d)
  return `${String(c.ano).padStart(4, '0')}-${String(c.mes).padStart(2, '0')}-${String(c.dia).padStart(2, '0')}`
}

/** Mostra 'dd/MM/aaaa'; recorrentes voltam com o ano 2000, então só dia e mês contam. */
function formatarDataFeriado(f: Feriado): string {
  const [ano, mes, dia] = f.data.split('-')
  return f.recorrente ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`
}

function FeriadosPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(feriadosConsultas.lista({ pagina, ano: search.ano }))
  const [editando, setEditando] = useState<Feriado | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<Feriado | null>(null)
  const excluir = useExcluirFeriado()
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Feriados
        </h1>
        <Button onClick={() => setEditando('novo')}>
          <Plus aria-hidden="true" /> Novo feriado
        </Button>
      </header>

      <div className="flex items-center gap-2">
        <Label htmlFor="filtro-ano">Ano</Label>
        <Input
          id="filtro-ano"
          type="number"
          inputMode="numeric"
          className="w-28"
          placeholder="Todos"
          defaultValue={search.ano ?? ''}
          onChange={(e) => {
            const ano = Number(e.target.value)
            const valido = Number.isInteger(ano) && ano >= 1900 && ano <= 2999
            if (e.target.value === '' || valido) {
              navigate({ search: () => ({ ano: valido ? ano : undefined }) })
            }
          }}
        />
      </div>

      <Table aria-label="Feriados">
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Repetição</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((feriado) => (
            <TableRow key={feriado.id} className="h-(--row-h)">
              <TableCell>{formatarDataFeriado(feriado)}</TableCell>
              <TableCell>{feriado.nome}</TableCell>
              <TableCell>
                <Badge variant={feriado.recorrente ? 'secondary' : 'outline'}>
                  {feriado.recorrente ? 'Todo ano' : 'Única'}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${feriado.nome}`}
                    onClick={() => setEditando(feriado)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Excluir ${feriado.nome}`}
                    onClick={() => setExcluindo(feriado)}
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

      <FeriadoSheet feriado={editando} aoFechar={() => setEditando(null)} />
      <ExcluirCadastroDialog
        alvo={excluindo}
        tipo="o feriado"
        sucesso="Feriado excluído"
        excluir={(id) => excluir.mutateAsync(id)}
        aoFechar={() => setExcluindo(null)}
      />
    </section>
  )
}

function FeriadoSheet({ feriado, aoFechar }: { feriado: Feriado | 'novo' | null; aoFechar: () => void }) {
  const existente = feriado !== null && feriado !== 'novo' ? feriado : null
  const salvar = useSalvarFeriado(existente?.id ?? null)
  const form = useZodForm(CriarFeriadoSchema, {
    values: {
      data: existente?.data ?? '',
      nome: existente?.nome ?? '',
      recorrente: existente?.recorrente ?? false,
      jornadaId: existente?.jornadaId ?? null,
    },
  })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(existente ? 'Feriado atualizado' : 'Feriado criado')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={feriado !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar feriado' : 'Novo feriado'}</SheetTitle>
          <SheetDescription>Dias sem expediente, descontados do prazo de SLA.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="data" rotulo="Data" obrigatorio>
            {(field, controle) => (
              <DatePicker
                id={controle.id}
                aria-invalid={controle['aria-invalid']}
                valor={field.value ? dataParaInstante(field.value) : null}
                aoMudar={(d) => field.onChange(d ? instanteParaData(d) : '')}
              />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
          </CampoForm>
          <CampoForm control={form.control} name="recorrente" rotulo="Repete todo ano">
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
