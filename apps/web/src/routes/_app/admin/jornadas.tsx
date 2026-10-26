import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CriarJornadaSchema, type Jornada } from '@vinimon/shared'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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
import { ExcluirCadastroDialog } from '@/features/admin/components/excluir-cadastro-dialog'
import { jornadasConsultas, useExcluirJornada, useSalvarJornada } from '@/features/jornadas/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const

interface Horario {
  diaSemana: number
  inicioMin: number
  fimMin: number
}

/** Minutos desde 00:00 → 'HH:MM' (1440 vira '24:00'). */
function minutosParaHora(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 'HH:MM' → minutos; devolve null quando o texto não é um horário válido. */
function horaParaMinutos(texto: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (min > 59 || h > 24 || (h === 24 && min > 0)) return null
  return h * 60 + min
}

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
})

export const Route = createFileRoute('/_app/admin/jornadas')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(jornadasConsultas.lista(deps)),
  component: JornadasPagina,
})

function resumoHorarios(j: Jornada): string {
  if (j.ininterrupta) return '24x7'
  return `${j.horarios.length} janela(s)`
}

function JornadasPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(jornadasConsultas.lista({ pagina, busca: search.busca }))
  const [editando, setEditando] = useState<Jornada | 'nova' | null>(null)
  const [excluindo, setExcluindo] = useState<Jornada | null>(null)
  const excluir = useExcluirJornada()
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Jornadas
        </h1>
        <Button onClick={() => setEditando('nova')}>
          <Plus aria-hidden="true" /> Nova jornada
        </Button>
      </header>

      <Table aria-label="Jornadas">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Fuso</TableHead>
            <TableHead>Horários</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((jornada) => (
            <TableRow key={jornada.id} className="h-(--row-h)">
              <TableCell>{jornada.nome}</TableCell>
              <TableCell>{jornada.timezone}</TableCell>
              <TableCell>{resumoHorarios(jornada)}</TableCell>
              <TableCell>
                <Badge variant={jornada.ativo ? 'secondary' : 'outline'}>{jornada.ativo ? 'Ativa' : 'Inativa'}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${jornada.nome}`}
                    onClick={() => setEditando(jornada)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Excluir ${jornada.nome}`}
                    onClick={() => setExcluindo(jornada)}
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

      <Sheet open={editando !== null} onOpenChange={(aberto) => (aberto ? undefined : setEditando(null))}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          {editando !== null ? (
            <JornadaForm jornada={editando === 'nova' ? null : editando} aoFechar={() => setEditando(null)} />
          ) : null}
        </SheetContent>
      </Sheet>
      <ExcluirCadastroDialog
        alvo={excluindo}
        tipo="a jornada"
        sucesso="Jornada excluída"
        aviso="A jornada usada como padrão do SLA não pode ser excluída."
        excluir={(id) => excluir.mutateAsync(id)}
        aoFechar={() => setExcluindo(null)}
      />
    </section>
  )
}

interface LinhaEditavel {
  chave: number
  diaSemana: number
  inicio: string
  fim: string
  inicioMin: number
  fimMin: number
}

let proximaChave = 0
const novaLinha = (h: Horario): LinhaEditavel => {
  proximaChave += 1
  return {
    chave: proximaChave,
    diaSemana: h.diaSemana,
    inicio: minutosParaHora(h.inicioMin),
    fim: minutosParaHora(h.fimMin),
    inicioMin: h.inicioMin,
    fimMin: h.fimMin,
  }
}

function HorariosEditor({ inicial, aoMudar }: { inicial: Horario[]; aoMudar: (h: Horario[]) => void }) {
  const [linhas, setLinhas] = useState<LinhaEditavel[]>(() => inicial.map(novaLinha))

  const atualizar = (proximas: LinhaEditavel[]) => {
    setLinhas(proximas)
    aoMudar(proximas.map(({ diaSemana, inicioMin, fimMin }) => ({ diaSemana, inicioMin, fimMin })))
  }
  const alterar = (chave: number, mudanca: Partial<LinhaEditavel>) =>
    atualizar(linhas.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)))

  return (
    <div className="grid gap-2">
      {linhas.map((linha, i) => (
        <div key={linha.chave} className="flex items-center gap-2">
          <Select value={String(linha.diaSemana)} onValueChange={(v) => alterar(linha.chave, { diaSemana: Number(v) })}>
            <SelectTrigger aria-label={`Dia da janela ${i + 1}`} className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIAS.map((nome, d) => (
                <SelectItem key={nome} value={String(d)}>
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label={`Início da janela ${i + 1}`}
            placeholder="HH:MM"
            className="w-24"
            value={linha.inicio}
            onChange={(e) => {
              const min = horaParaMinutos(e.target.value)
              alterar(linha.chave, { inicio: e.target.value, ...(min === null ? {} : { inicioMin: min }) })
            }}
          />
          <Input
            aria-label={`Fim da janela ${i + 1}`}
            placeholder="HH:MM"
            className="w-24"
            value={linha.fim}
            onChange={(e) => {
              const min = horaParaMinutos(e.target.value)
              alterar(linha.chave, { fim: e.target.value, ...(min === null ? {} : { fimMin: min }) })
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Remover janela ${i + 1}`}
            onClick={() => atualizar(linhas.filter((l) => l.chave !== linha.chave))}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => atualizar([...linhas, novaLinha({ diaSemana: 1, inicioMin: 480, fimMin: 1080 })])}
      >
        <Plus aria-hidden="true" /> Adicionar horário
      </Button>
    </div>
  )
}

function JornadaForm({ jornada: existente, aoFechar }: { jornada: Jornada | null; aoFechar: () => void }) {
  const salvar = useSalvarJornada(existente?.id ?? null)
  const form = useZodForm(CriarJornadaSchema, {
    values: {
      nome: existente?.nome ?? '',
      timezone: existente?.timezone ?? 'America/Sao_Paulo',
      ininterrupta: existente?.ininterrupta ?? false,
      ativo: existente?.ativo ?? true,
      horarios: existente?.horarios.map((h) => ({ ...h })) ?? [],
    },
  })
  const ininterrupta = form.watch('ininterrupta')

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync({ ...dados, horarios: dados.ininterrupta ? [] : dados.horarios })
      toast.success(existente ? 'Jornada atualizada' : 'Jornada criada')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <>
      <SheetHeader>
        <SheetTitle>{existente ? 'Editar jornada' : 'Nova jornada'}</SheetTitle>
        <SheetDescription>Janelas de atendimento usadas no cálculo dos prazos de SLA.</SheetDescription>
      </SheetHeader>
      <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
        <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
          {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
        </CampoForm>
        <CampoForm control={form.control} name="timezone" rotulo="Fuso horário" obrigatorio>
          {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
        </CampoForm>
        <CampoForm control={form.control} name="ininterrupta" rotulo="24x7">
          {(field, controle) => (
            <Switch
              id={controle.id}
              aria-describedby={controle['aria-describedby']}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        </CampoForm>
        {ininterrupta ? null : (
          <CampoForm control={form.control} name="horarios" rotulo="Horários">
            {(field) => <HorariosEditor inicial={field.value} aoMudar={(h) => field.onChange(h)} />}
          </CampoForm>
        )}
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
    </>
  )
}
