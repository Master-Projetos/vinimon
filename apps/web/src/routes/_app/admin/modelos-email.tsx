import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AtualizarModeloEmailSchema, EnviarTesteEmailSchema, type ModeloEmail, VARIAVEIS_EMAIL } from '@vinimon/shared'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CampoForm } from '@/components/form/campo-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { modelosEmailConsultas, useEnviarTesteEmail, useSalvarModeloEmail } from '@/features/modelos-email/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

/** Rótulos dos eventos com modelo (E04). Evento sem rótulo aparece com a chave técnica. */
const ROTULOS_EVENTO: Record<string, string | undefined> = {
  abertura: 'Abertura de chamado',
  comentario: 'Comentário',
  encaminhamento: 'Encaminhamento',
  agendamento: 'Agendamento',
  conclusao: 'Conclusão',
  rejeicao: 'Rejeição',
  solicitacao_retorno: 'Solicitação de retorno',
  encerramento_automatico: 'Encerramento automático',
  lembrete: 'Lembrete',
  recuperar_senha: 'Recuperação de senha',
}

const rotuloEvento = (evento: string): string => ROTULOS_EVENTO[evento] ?? evento

export const Route = createFileRoute('/_app/admin/modelos-email')({
  loader: ({ context }) => context.queryClient.ensureQueryData(modelosEmailConsultas.lista()),
  component: ModelosEmailPagina,
})

function ModelosEmailPagina() {
  const { data } = useSuspenseQuery(modelosEmailConsultas.lista())
  const [editando, setEditando] = useState<ModeloEmail | null>(null)

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Modelos de e-mail
        </h1>
      </header>

      <Table aria-label="Modelos de e-mail">
        <TableHeader>
          <TableRow>
            <TableHead>Evento</TableHead>
            <TableHead>Assunto</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((modelo) => (
            <TableRow key={modelo.evento} className="h-(--row-h)">
              <TableCell>{rotuloEvento(modelo.evento)}</TableCell>
              <TableCell>{modelo.assunto}</TableCell>
              <TableCell>
                <Badge variant={modelo.ativo ? 'secondary' : 'outline'}>{modelo.ativo ? 'Ativo' : 'Inativo'}</Badge>
              </TableCell>
              <TableCell>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Editar modelo ${rotuloEvento(modelo.evento)}`}
                  onClick={() => setEditando(modelo)}
                >
                  <Pencil aria-hidden="true" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Sheet open={editando !== null} onOpenChange={(aberto) => (aberto ? undefined : setEditando(null))}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          {editando === null ? null : (
            <EditorModelo key={editando.evento} modelo={editando} aoFechar={() => setEditando(null)} />
          )}
        </SheetContent>
      </Sheet>
    </section>
  )
}

function EditorModelo({ modelo, aoFechar }: { modelo: ModeloEmail; aoFechar: () => void }) {
  const salvar = useSalvarModeloEmail(modelo.evento)
  const form = useZodForm(AtualizarModeloEmailSchema, {
    values: { assunto: modelo.assunto, corpoTexto: modelo.corpoTexto, ativo: modelo.ativo },
  })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success('Modelo salvo')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <>
      <SheetHeader>
        <SheetTitle>{rotuloEvento(modelo.evento)}</SheetTitle>
        <SheetDescription>Edite o assunto e o corpo. Use as variáveis abaixo entre chaves duplas.</SheetDescription>
      </SheetHeader>

      <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
        <CampoForm control={form.control} name="assunto" rotulo="Assunto" obrigatorio>
          {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
        </CampoForm>
        <CampoForm control={form.control} name="corpoTexto" rotulo="Corpo" obrigatorio>
          {(field, controle) => <Textarea {...field} {...controle} rows={10} />}
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

      <section aria-labelledby="titulo-variaveis" className="px-4">
        <h3 id="titulo-variaveis" className="text-sm font-semibold">
          Variáveis disponíveis
        </h3>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {VARIAVEIS_EMAIL.map((variavel) => (
            <li key={variavel}>
              <code className="rounded bg-muted px-1.5 py-0.5">{`{{${variavel}}}`}</code>
            </li>
          ))}
        </ul>
      </section>

      <EnviarTeste />
    </>
  )
}

/** Envio de teste: usa um texto fixo, não o modelo salvo. Fica fora do formulário de edição. */
function EnviarTeste() {
  const enviarTeste = useEnviarTesteEmail()
  const form = useZodForm(EnviarTesteEmailSchema, { defaultValues: { para: '' } })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await enviarTeste.mutateAsync(dados)
      toast.success('Teste agendado para envio')
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <form onSubmit={enviar} noValidate className="grid gap-3 border-t px-4 pt-4">
      <h3 className="text-sm font-semibold">Enviar teste</h3>
      <CampoForm control={form.control} name="para" rotulo="Para" obrigatorio descricao="Mensagem de teste fixa.">
        {(field, controle) => <Input {...field} {...controle} type="email" autoComplete="off" />}
      </CampoForm>
      <div className="flex justify-end">
        <Button type="submit" variant="outline" disabled={enviarTeste.isPending}>
          Enviar teste
        </Button>
      </div>
    </form>
  )
}
