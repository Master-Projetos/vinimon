import { useSuspenseQuery } from '@tanstack/react-query'
import { type Ativo, CriarAtivoSchema, SITUACOES_ATIVO } from '@vinimon/shared'
import { toast } from 'sonner'
import { CampoForm } from '@/components/form/campo-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { metaConsultas } from '@/features/meta/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'
import { ROTULOS_SITUACAO_ATIVO } from '@/lib/rotulos'
import { useSalvarAtivo } from '../queries'

export interface AtivoSheetProps {
  ativo: Ativo | 'novo' | null
  aoFechar: () => void
}

const SEM_DEPARTAMENTO = 'nenhum'

/** Cria ou edita um ativo. Só aparece para quem tem `inventario.gerenciar` (a API também confere). */
export function AtivoSheet({ ativo, aoFechar }: AtivoSheetProps) {
  const existente = ativo !== null && ativo !== 'novo' ? ativo : null
  const { data: meta } = useSuspenseQuery(metaConsultas.tudo())
  const salvar = useSalvarAtivo(existente?.id ?? null)
  const form = useZodForm(CriarAtivoSchema, {
    values: {
      etiqueta: existente?.etiqueta ?? '',
      tipoId: existente?.tipoId ?? meta.tiposAtivo[0]?.id ?? 0,
      modelo: existente?.modelo ?? null,
      serie: existente?.serie ?? null,
      departamentoId: existente?.departamentoId ?? null,
      responsavelTexto: existente?.responsavelTexto ?? null,
      situacao: existente?.situacao ?? 'EM_USO',
      observacao: existente?.observacao ?? null,
    },
  })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(existente ? 'Ativo atualizado' : 'Ativo criado')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={ativo !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar ativo' : 'Novo ativo'}</SheetTitle>
          <SheetDescription>A etiqueta identifica o equipamento no QR code e nos chamados.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="etiqueta" rotulo="Etiqueta" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
          </CampoForm>
          <CampoForm control={form.control} name="tipoId" rotulo="Tipo" obrigatorio>
            {(field, controle) => (
              <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                <SelectTrigger {...controle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meta.tiposAtivo.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm control={form.control} name="modelo" rotulo="Modelo">
            {(field, controle) => (
              <Input
                {...field}
                {...controle}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
              />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="serie" rotulo="Número de série">
            {(field, controle) => (
              <Input
                {...field}
                {...controle}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
              />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="departamentoId" rotulo="Departamento">
            {(field, controle) => (
              <Select
                value={field.value == null ? SEM_DEPARTAMENTO : String(field.value)}
                onValueChange={(v) => field.onChange(v === SEM_DEPARTAMENTO ? null : Number(v))}
              >
                <SelectTrigger {...controle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_DEPARTAMENTO}>Sem departamento</SelectItem>
                  {meta.departamentos.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm control={form.control} name="responsavelTexto" rotulo="Responsável">
            {(field, controle) => (
              <Input
                {...field}
                {...controle}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
              />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="situacao" rotulo="Situação">
            {(field, controle) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger {...controle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SITUACOES_ATIVO.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ROTULOS_SITUACAO_ATIVO[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm control={form.control} name="observacao" rotulo="Observação">
            {(field, controle) => (
              <Textarea
                {...field}
                {...controle}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
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
