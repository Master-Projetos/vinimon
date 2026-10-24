import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  type Artigo,
  CriarArtigoSchema,
  SITUACOES_ARTIGO,
  type SituacaoArtigo,
  VISIBILIDADES_ARTIGO,
  type VisibilidadeArtigo,
} from '@vinimon/shared'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { CampoForm } from '@/components/form/campo-form'
import { MarkdownEditor } from '@/components/form/markdown-editor'
import { MultiComboboxField } from '@/components/form/multi-combobox-field'
import { PaneHeader } from '@/components/layout/pane-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { metaConsultas } from '@/features/meta/queries'
import { useAlteracoesNaoSalvas } from '@/hooks/use-alteracoes-nao-salvas'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'
import { ROTULOS_SITUACAO_ARTIGO } from '@/lib/rotulos'
import { artigosConsultas, useExcluirArtigo, useSalvarArtigo } from '../queries'

const ROTULOS_VISIBILIDADE: Record<VisibilidadeArtigo, string> = {
  PUBLICO: 'Público',
  INTERNO: 'Interno (somente equipe)',
}
const SEM_CATEGORIA = 'nenhuma'

export interface ArtigoFormProps {
  /** Ausente = criação. */
  artigo?: Artigo
}

/** Formulário de artigo (criar e editar). Só a equipe chega aqui (`conhecimento.gerenciar`). */
export function ArtigoForm({ artigo }: ArtigoFormProps) {
  const navigate = useNavigate()
  const salvar = useSalvarArtigo(artigo?.id ?? null)
  const excluir = useExcluirArtigo(artigo?.id ?? 0)
  const [confirmando, setConfirmando] = useState(false)
  const categorias = useQuery(artigosConsultas.categorias())
  const meta = useQuery(metaConsultas.tudo())
  const form = useZodForm(CriarArtigoSchema, {
    values: {
      titulo: artigo?.titulo ?? '',
      resumo: artigo?.resumo ?? null,
      conteudo: artigo?.conteudo ?? '',
      categoriaId: artigo?.categoriaId ?? null,
      situacao: artigo?.situacao ?? 'RASCUNHO',
      visibilidade: artigo?.visibilidade ?? 'PUBLICO',
      problemaIds: artigo?.problemaIds ?? [],
    },
  })
  const [saindo, setSaindo] = useState(false)
  useAlteracoesNaoSalvas(form.formState.isDirty && !saindo)

  const enviar = form.handleSubmit(async (dados) => {
    try {
      const salvo = await salvar.mutateAsync(dados)
      toast.success(artigo ? 'Artigo atualizado' : 'Artigo criado')
      flushSync(() => setSaindo(true))
      await navigate({ to: '/conhecimento/$artigoId', params: { artigoId: salvo.id } })
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  async function confirmarExclusao() {
    await excluir.mutateAsync()
    toast.success('Artigo excluído')
    flushSync(() => setSaindo(true))
    await navigate({ to: '/conhecimento' })
  }

  const opcoesProblemas = (meta.data?.problemas ?? []).map((p) => ({ valor: String(p.id), rotulo: p.nome }))

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        titulo={artigo ? 'Editar artigo' : 'Novo artigo'}
        voltarPara={
          artigo ? { to: '/conhecimento/$artigoId', params: { artigoId: artigo.id } } : { to: '/conhecimento' }
        }
        acoes={
          artigo ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmando(true)}>
              <Trash2 aria-hidden="true" /> Excluir
            </Button>
          ) : null
        }
      />
      <form onSubmit={enviar} noValidate className="mx-auto grid w-full max-w-3xl gap-4 overflow-y-auto p-(--pane-px)">
        <CampoForm control={form.control} name="titulo" rotulo="Título" obrigatorio>
          {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
        </CampoForm>
        <CampoForm control={form.control} name="resumo" rotulo="Resumo">
          {(field, controle) => (
            <Textarea
              {...field}
              {...controle}
              rows={2}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
            />
          )}
        </CampoForm>
        <CampoForm control={form.control} name="categoriaId" rotulo="Categoria">
          {(field, controle) => (
            <Select
              value={field.value === null ? SEM_CATEGORIA : String(field.value)}
              onValueChange={(v) => field.onChange(v === SEM_CATEGORIA ? null : Number(v))}
            >
              <SelectTrigger id={controle.id} className="w-full" aria-invalid={controle['aria-invalid']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_CATEGORIA}>Sem categoria</SelectItem>
                {(categorias.data?.itens ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CampoForm>
        <CampoForm control={form.control} name="problemaIds" rotulo="Tipos de problema">
          {(field, controle) => (
            <MultiComboboxField
              id={controle.id}
              aria-invalid={controle['aria-invalid']}
              aria-describedby={controle['aria-describedby']}
              opcoes={opcoesProblemas}
              valores={(field.value ?? []).map(String)}
              aoMudar={(v) => field.onChange(v.map(Number))}
              placeholder="Selecione os tipos de problema"
            />
          )}
        </CampoForm>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoForm control={form.control} name="visibilidade" rotulo="Visibilidade">
            {(field, controle) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  const valor = VISIBILIDADES_ARTIGO.find((o) => o === v)
                  if (valor) field.onChange(valor)
                }}
              >
                <SelectTrigger id={controle.id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILIDADES_ARTIGO.map((v) => (
                    <SelectItem key={v} value={v}>
                      {ROTULOS_VISIBILIDADE[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm control={form.control} name="situacao" rotulo="Situação">
            {(field, controle) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  const valor: SituacaoArtigo | undefined = SITUACOES_ARTIGO.find((o) => o === v)
                  if (valor) field.onChange(valor)
                }}
              >
                <SelectTrigger id={controle.id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SITUACOES_ARTIGO.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ROTULOS_SITUACAO_ARTIGO[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
        </div>
        <CampoForm control={form.control} name="conteudo" rotulo="Conteúdo" obrigatorio>
          {(field, controle) => (
            <MarkdownEditor
              id={controle.id}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              aria-invalid={controle['aria-invalid']}
              aria-describedby={controle['aria-describedby']}
            />
          )}
        </CampoForm>
        <div className="flex justify-end">
          <Button type="submit" disabled={form.formState.isSubmitting || salvar.isPending}>
            Salvar
          </Button>
        </div>
      </form>
      {artigo ? (
        <ConfirmDialog
          aberto={confirmando}
          aoMudarAberto={setConfirmando}
          titulo="Excluir artigo?"
          descricao={`O artigo "${artigo.titulo}" será removido da base de conhecimento.`}
          rotuloConfirmar="Excluir"
          destrutivo
          aoConfirmar={confirmarExclusao}
        />
      ) : null}
    </section>
  )
}
