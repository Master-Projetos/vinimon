import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CriarProblemaSchema, type Problema } from '@vinimon/shared'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { MultiComboboxField } from '@/components/form/multi-combobox-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ExcluirCadastroDialog } from '@/features/admin/components/excluir-cadastro-dialog'
import { metaConsultas } from '@/features/meta/queries'
import { problemasConsultas, useExcluirProblema, useSalvarProblema } from '@/features/problemas/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
})

export const Route = createFileRoute('/_app/admin/problemas')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(problemasConsultas.lista(deps)),
      context.queryClient.ensureQueryData(metaConsultas.tudo()),
    ])
  },
  component: ProblemasPagina,
})

function minutos(valor: number | null): string {
  return valor === null ? '—' : `${valor} min`
}

function numeroOuNulo(texto: string): number | null {
  return texto.trim() === '' ? null : Number(texto)
}

function ProblemasPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(problemasConsultas.lista({ pagina, busca: search.busca }))
  const [editando, setEditando] = useState<Problema | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<Problema | null>(null)
  const excluir = useExcluirProblema()
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Tipos de problema
        </h1>
        <Button onClick={() => setEditando('novo')}>
          <Plus aria-hidden="true" /> Novo tipo de problema
        </Button>
      </header>

      <Table aria-label="Tipos de problema">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Áreas</TableHead>
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
              <TableCell>{p.nome}</TableCell>
              <TableCell>{p.areas.map((a) => a.nome).join(', ')}</TableCell>
              <TableCell>{minutos(p.slaRespostaMin)}</TableCell>
              <TableCell>{minutos(p.slaSolucaoMin)}</TableCell>
              <TableCell>
                <Badge variant={p.ativo ? 'secondary' : 'outline'}>{p.ativo ? 'Ativo' : 'Inativo'}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Editar ${p.nome}`} onClick={() => setEditando(p)}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Excluir ${p.nome}`} onClick={() => setExcluindo(p)}>
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

      <ProblemaSheet problema={editando} aoFechar={() => setEditando(null)} />
      <ExcluirCadastroDialog
        alvo={excluindo}
        tipo="o tipo de problema"
        sucesso="Tipo de problema excluído"
        aviso="Tipos de problema usados em chamados não podem ser excluídos."
        excluir={(id) => excluir.mutateAsync(id)}
        aoFechar={() => setExcluindo(null)}
      />
    </section>
  )
}

function ProblemaSheet({ problema, aoFechar }: { problema: Problema | 'novo' | null; aoFechar: () => void }) {
  const existente = problema !== null && problema !== 'novo' ? problema : null
  const { data: meta } = useSuspenseQuery(metaConsultas.tudo())
  const salvar = useSalvarProblema(existente?.id ?? null)
  const form = useZodForm(CriarProblemaSchema, {
    values: {
      nome: existente?.nome ?? '',
      descricao: existente?.descricao ?? '',
      areaIds: existente?.areas.map((a) => a.id) ?? [],
      areaPadraoId: existente?.areaPadraoId ?? 0,
      slaRespostaMin: existente?.slaRespostaMin ?? null,
      slaSolucaoMin: existente?.slaSolucaoMin ?? null,
      ativo: existente?.ativo ?? true,
    },
  })
  // O tipo de entrada do Zod é `unknown` (coerce): normaliza para número.
  const areaIds = (form.watch('areaIds') ?? []).map(Number)
  const opcoesAreas = meta.areas.map((a) => ({ valor: String(a.id), rotulo: a.nome }))
  // A área padrão só pode ser uma das escolhidas.
  const padraoPossiveis = meta.areas.filter((a) => areaIds.includes(a.id))

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(existente ? 'Tipo de problema atualizado' : 'Tipo de problema criado')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={problema !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar tipo de problema' : 'Novo tipo de problema'}</SheetTitle>
          <SheetDescription>Define para quais áreas o chamado vai e os prazos de SLA do tipo.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
          </CampoForm>
          <CampoForm control={form.control} name="descricao" rotulo="Descrição">
            {(field, controle) => <Textarea {...field} {...controle} value={field.value ?? ''} />}
          </CampoForm>
          <CampoForm control={form.control} name="areaIds" rotulo="Áreas" obrigatorio>
            {(field, controle) => (
              <MultiComboboxField
                id={controle.id}
                aria-invalid={controle['aria-invalid']}
                aria-describedby={controle['aria-describedby']}
                opcoes={opcoesAreas}
                valores={areaIds.map(String)}
                placeholder="Escolha as áreas"
                aoMudar={(v) => {
                  const ids = v.map(Number)
                  field.onChange(ids)
                  const padrao = Number(form.getValues('areaPadraoId'))
                  if (!ids.includes(padrao)) form.setValue('areaPadraoId', ids[0] ?? 0, { shouldValidate: true })
                }}
              />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="areaPadraoId" rotulo="Área padrão" obrigatorio>
            {(field, controle) => (
              <Select
                value={Number(field.value) > 0 ? String(field.value) : ''}
                onValueChange={(v) => field.onChange(Number(v))}
                disabled={padraoPossiveis.length === 0}
              >
                <SelectTrigger {...controle}>
                  <SelectValue placeholder="Escolha primeiro as áreas" />
                </SelectTrigger>
                <SelectContent>
                  {padraoPossiveis.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm
            control={form.control}
            name="slaRespostaMin"
            rotulo="Prazo de resposta (min)"
            descricao="Em minutos (h × 60). Vazio não define prazo."
          >
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
          <CampoForm
            control={form.control}
            name="slaSolucaoMin"
            rotulo="Prazo de solução (min)"
            descricao="Em minutos (h × 60). Vazio não define prazo."
          >
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
