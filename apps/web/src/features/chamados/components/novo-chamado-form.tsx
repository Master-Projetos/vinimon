import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CriarChamadoSchema, type Meta, temPermissao, type UsuarioMe } from '@vinimon/shared'
import { useEffect, useId, useRef, useState } from 'react'
import { Controller } from 'react-hook-form'
import { toast } from 'sonner'
import { CampoForm } from '@/components/form/campo-form'
import { ComboboxField, type ComboboxOpcao } from '@/components/form/combobox-field'
import { MarkdownEditor } from '@/components/form/markdown-editor'
import { MultiComboboxField } from '@/components/form/multi-combobox-field'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { enviarAnexosEmSequencia, mensagemDeFalhaDeAnexos } from '@/features/anexos/queries'
import { useDebounce } from '@/hooks/use-debounce'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'
import { gravar, ler, remover } from '@/lib/storage'
import { ativoPorEtiquetaConsulta, buscarAtivos, buscarUsuarios, useCriarChamado } from '../queries'
import { ArtigosSugeridos } from './artigos-sugeridos'
import { PrioridadeRadio } from './prioridade-radio'
import { ReincidenciaPanel } from './reincidencia-panel'

const LIMITE_ASSUNTO = 150
const ATRASO_RASCUNHO_MS = 1_000

/** Campos guardados no rascunho. Nunca contatos nem anexos. */
interface Rascunho {
  assunto?: string
  descricao?: string
  problemaId?: number
  prioridadeId?: number
  departamentoId?: number
  ativoId?: number
}

function lerRascunho(chave: string): Rascunho | null {
  const bruto = ler<unknown>(chave, null)
  if (typeof bruto !== 'object' || bruto === null) return null
  const texto = (k: string) => {
    const v = Reflect.get(bruto, k)
    return typeof v === 'string' && v !== '' ? v : undefined
  }
  const numero = (k: string) => {
    const v = Reflect.get(bruto, k)
    return typeof v === 'number' ? v : undefined
  }
  const r: Rascunho = {
    assunto: texto('assunto'),
    descricao: texto('descricao'),
    problemaId: numero('problemaId'),
    prioridadeId: numero('prioridadeId'),
    departamentoId: numero('departamentoId'),
    ativoId: numero('ativoId'),
  }
  return r.assunto || r.descricao ? r : null
}

export interface NovoChamadoFormProps {
  meta: Meta
  usuario: UsuarioMe
  /** `?problema=`: tipo pré-selecionado, se existir no catálogo. */
  problemaInicial?: number
  /** `?equipamento=`: etiqueta do ativo, resolvida pela busca exata. */
  equipamento?: string
}

// `zId` usa z.coerce, cujo valor de entrada é unknown: os helpers aceitam unknown (como em ativo-sheet).
const paraTexto = (valor: unknown): string | null => (valor == null ? null : String(valor))
const comoNumero = (valor: unknown): number | undefined => (typeof valor === 'number' ? valor : undefined)
const paraNumero = (valor: string | null): number | undefined => (valor === null ? undefined : Number(valor))

async function opcoesDeUsuarios(termo: string, signal: AbortSignal): Promise<ComboboxOpcao[]> {
  if (termo.trim().length < 2) return []
  const usuarios = await buscarUsuarios(termo, signal)
  return usuarios.map((u) => ({
    valor: String(u.id),
    rotulo: u.nome,
    ...(u.areaNome ? { descricao: u.areaNome } : {}),
  }))
}

async function opcoesDeAtivos(termo: string, signal: AbortSignal): Promise<ComboboxOpcao[]> {
  if (termo.trim().length < 3) return []
  const ativos = await buscarAtivos(termo, signal)
  return ativos.map((a) => ({ valor: String(a.id), rotulo: a.etiqueta, descricao: a.tipo }))
}

/**
 * Formulário de abertura (§6.3, 5). Tipo de problema primeiro; área, em nome de, canal e tags só para a equipe.
 * As regras de permissão e de escopo são da API: a interface só esconde.
 */
export function NovoChamadoForm({ meta, usuario, problemaInicial, equipamento }: NovoChamadoFormProps) {
  const navigate = useNavigate()
  const criar = useCriarChamado()
  const equipe = temPermissao(usuario.perfil, 'chamado.atender')
  const podeEmNome = temPermissao(usuario.perfil, 'chamado.abrirEmNome')
  const idPrioridade = useId()
  const problemaSemente = meta.problemas.find((p) => p.id === problemaInicial)
  const prioridadePadrao = meta.prioridades.find((p) => p.padrao)?.id
  const ativoInicial = useQuery(ativoPorEtiquetaConsulta(equipamento ?? ''))
  const chaveRascunho = `u${usuario.id}:rascunho:novo-chamado`
  const [rascunhoInicial] = useState(() => lerRascunho(chaveRascunho))
  const [restaurado, setRestaurado] = useState(rascunhoInicial !== null)
  const [arquivos, setArquivos] = useState<File[]>([])
  const [envio, setEnvio] = useState<{ indice: number; pct: number } | null>(null)
  const chavesArquivos = useRef(new WeakMap<File, string>())
  const anexosHabilitados = meta.config['anexos.habilitados'] === true

  const form = useZodForm(CriarChamadoSchema, {
    defaultValues: {
      ...(rascunhoInicial ?? {}),
      problemaId: problemaSemente?.id ?? rascunhoInicial?.problemaId,
      areaId: equipe ? (problemaSemente?.areaPadraoId ?? undefined) : undefined,
      prioridadeId: rascunhoInicial?.prioridadeId ?? prioridadePadrao,
      contato: usuario.nome,
      contatoEmail: usuario.email ?? undefined,
      telefone: usuario.telefone ?? undefined,
    },
  })
  const { setValue, getValues, watch, handleSubmit, setError, formState } = form
  const problemaId = watch('problemaId')
  const problema = meta.problemas.find((p) => p.id === problemaId)
  const areas = problema ? meta.areas.filter((a) => problema.areaIds.includes(a.id)) : []
  const ativoEncontrado = ativoInicial.data
  const assunto = watch('assunto')
  const ativoId = watch('ativoId')
  const campos = useDebounce(
    {
      assunto: assunto ?? '',
      descricao: watch('descricao') ?? '',
      problemaId: comoNumero(problemaId),
      prioridadeId: comoNumero(watch('prioridadeId')),
      departamentoId: comoNumero(watch('departamentoId')),
      ativoId: comoNumero(ativoId),
    },
    ATRASO_RASCUNHO_MS,
  )
  const enviado = useRef(false)

  useEffect(() => {
    if (enviado.current) return
    if (campos.assunto || campos.descricao) gravar(chaveRascunho, campos)
  }, [campos, chaveRascunho])

  function descartarRascunho() {
    remover(chaveRascunho)
    setRestaurado(false)
    form.reset({
      assunto: '',
      descricao: '',
      problemaId: problemaSemente?.id,
      areaId: equipe ? (problemaSemente?.areaPadraoId ?? undefined) : undefined,
      prioridadeId: prioridadePadrao,
      contato: usuario.nome,
      contatoEmail: usuario.email ?? undefined,
      telefone: usuario.telefone ?? undefined,
    })
  }

  function aoResolver(_artigoId: number) {
    enviado.current = true
    remover(chaveRascunho)
    void navigate({ to: '/conhecimento' })
  }

  function adicionarArquivos(novos: File[]) {
    setArquivos((atuais) => [...atuais, ...novos])
  }
  const chaveDe = (f: File): string => {
    const atual = chavesArquivos.current.get(f)
    if (atual) return atual
    const nova = crypto.randomUUID()
    chavesArquivos.current.set(f, nova)
    return nova
  }

  useEffect(() => {
    if (ativoEncontrado && getValues('ativoId') === undefined) setValue('ativoId', ativoEncontrado.id)
  }, [ativoEncontrado, getValues, setValue])

  function escolherProblema(id: number | undefined) {
    setValue('problemaId', id, { shouldValidate: true, shouldDirty: true })
    if (equipe) setValue('areaId', meta.problemas.find((p) => p.id === id)?.areaPadraoId ?? undefined)
  }

  const enviar = handleSubmit(async (corpo) => {
    try {
      const chamado = await criar.mutateAsync(corpo)
      enviado.current = true
      remover(chaveRascunho)
      toast.success(`Chamado #${chamado.id} aberto`)
      if (arquivos.length > 0) {
        const falhas = await enviarAnexosEmSequencia(chamado.id, arquivos, (indice, pct) => setEnvio({ indice, pct }))
        setEnvio(null)
        if (falhas > 0) toast.error(mensagemDeFalhaDeAnexos(falhas))
      }
      await navigate({ to: '/chamados/$chamadoId', params: { chamadoId: chamado.id } })
    } catch (erro) {
      aplicarErrosDoServidor(setError, erro)
    }
  })

  return (
    <form onSubmit={enviar} noValidate className="mx-auto w-full max-w-3xl space-y-8 p-(--pane-px)">
      <h1 className="text-title" tabIndex={-1}>
        Novo chamado
      </h1>

      {restaurado ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm"
        >
          <span>Rascunho restaurado</span>
          <Button type="button" variant="ghost" size="sm" onClick={descartarRascunho}>
            Descartar
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="secao-problema" className="space-y-4">
        <h2 id="secao-problema" className="text-sm font-semibold">
          Problema
        </h2>
        <CampoForm control={form.control} name="problemaId" rotulo="Tipo de problema" obrigatorio>
          {(field, controle) => (
            <ComboboxField
              id={controle.id}
              valor={paraTexto(field.value)}
              aoMudar={(v) => escolherProblema(paraNumero(v))}
              opcoes={meta.problemas.map((p) => ({
                valor: String(p.id),
                rotulo: p.nome,
                ...(p.descricao ? { descricao: p.descricao } : {}),
              }))}
              placeholder="Escolha o tipo de problema"
              placeholderBusca="Buscar tipo..."
              aria-invalid={controle['aria-invalid']}
              aria-describedby={controle['aria-describedby']}
            />
          )}
        </CampoForm>
        {equipe ? (
          <CampoForm control={form.control} name="areaId" rotulo="Área">
            {(field, controle) => (
              <ComboboxField
                id={controle.id}
                valor={paraTexto(field.value)}
                aoMudar={(v) => field.onChange(paraNumero(v))}
                opcoes={areas.map((a) => ({ valor: String(a.id), rotulo: a.nome }))}
                placeholder={problema ? 'Escolha a área' : 'Escolha o tipo antes'}
                placeholderBusca="Buscar área..."
                desabilitado={!problema}
                aria-invalid={controle['aria-invalid']}
                aria-describedby={controle['aria-describedby']}
              />
            )}
          </CampoForm>
        ) : null}
      </section>

      <section aria-labelledby="secao-detalhes" className="space-y-4">
        <h2 id="secao-detalhes" className="text-sm font-semibold">
          Detalhes
        </h2>
        <CampoForm control={form.control} name="assunto" rotulo="Assunto" obrigatorio>
          {(field, controle) => (
            <>
              <Input
                id={controle.id}
                value={field.value ?? ''}
                maxLength={LIMITE_ASSUNTO}
                onBlur={field.onBlur}
                onChange={(e) => field.onChange(e.target.value)}
                aria-invalid={controle['aria-invalid']}
                aria-describedby={controle['aria-describedby']}
              />
              <p className="text-right text-xs text-muted-foreground">
                {(field.value ?? '').length}/{LIMITE_ASSUNTO}
              </p>
            </>
          )}
        </CampoForm>
        <CampoForm control={form.control} name="descricao" rotulo="Descrição" obrigatorio>
          {(field, controle) => (
            <MarkdownEditor
              id={controle.id}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder="Descreva o problema. Markdown é aceito."
              aria-invalid={controle['aria-invalid']}
              aria-describedby={controle['aria-describedby']}
            />
          )}
        </CampoForm>
        <ArtigosSugeridos assunto={assunto ?? ''} problemaId={comoNumero(problemaId)} aoResolver={aoResolver} />
        <Controller
          control={form.control}
          name="prioridadeId"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel id={idPrioridade}>
                Prioridade<span aria-hidden="true"> *</span>
              </FieldLabel>
              <PrioridadeRadio
                id={idPrioridade}
                aria-labelledby={idPrioridade}
                opcoes={meta.prioridades}
                valor={comoNumero(field.value)}
                aoMudar={field.onChange}
              />
              {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
            </Field>
          )}
        />
      </section>

      <section aria-labelledby="secao-equipamento" className="space-y-4">
        <h2 id="secao-equipamento" className="text-sm font-semibold">
          Local e equipamento
        </h2>
        <CampoForm control={form.control} name="departamentoId" rotulo="Departamento">
          {(field, controle) => (
            <ComboboxField
              id={controle.id}
              valor={paraTexto(field.value)}
              aoMudar={(v) => field.onChange(paraNumero(v))}
              opcoes={meta.departamentos.map((d) => ({ valor: String(d.id), rotulo: d.nome }))}
              placeholder="Nenhum departamento"
              placeholderBusca="Buscar departamento..."
              limpavel
              aria-invalid={controle['aria-invalid']}
              aria-describedby={controle['aria-describedby']}
            />
          )}
        </CampoForm>
        <CampoForm
          control={form.control}
          name="ativoId"
          rotulo="Ativo"
          descricao="Busque pela etiqueta (3+ caracteres)."
        >
          {(field, controle) => (
            <ComboboxField
              id={controle.id}
              valor={paraTexto(field.value)}
              aoMudar={(v) => field.onChange(paraNumero(v))}
              opcoes={
                ativoEncontrado
                  ? [
                      {
                        valor: String(ativoEncontrado.id),
                        rotulo: ativoEncontrado.etiqueta,
                        descricao: ativoEncontrado.tipo,
                      },
                    ]
                  : []
              }
              buscar={opcoesDeAtivos}
              placeholder="Nenhum ativo"
              placeholderBusca="Buscar por etiqueta..."
              textoVazio="Digite ao menos 3 caracteres."
              limpavel
              aria-invalid={controle['aria-invalid']}
              aria-describedby={controle['aria-describedby']}
            />
          )}
        </CampoForm>
      </section>

      <ReincidenciaPanel ativoId={comoNumero(ativoId)} problemaId={comoNumero(problemaId)} />

      {anexosHabilitados ? (
        <section aria-labelledby="secao-anexos" className="space-y-3">
          <h2 id="secao-anexos" className="text-sm font-semibold">
            Anexos
          </h2>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              adicionarArquivos([...e.dataTransfer.files])
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground hover:bg-accent/40"
          >
            <span>Arraste arquivos aqui ou clique para escolher</span>
            <input
              type="file"
              multiple
              className="sr-only"
              aria-label="Anexar arquivos"
              onChange={(e) => {
                adicionarArquivos([...(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
          </label>
          {arquivos.length > 0 ? (
            <ul aria-label="Arquivos para anexar" className="space-y-1 text-sm">
              {arquivos.map((a, i) => (
                <li key={chaveDe(a)} className="flex items-center justify-between gap-2">
                  <span className="truncate">{a.name}</span>
                  {envio?.indice === i ? (
                    <span className="text-xs text-muted-foreground">{envio.pct}%</span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remover ${a.name}`}
                      disabled={envio !== null}
                      onClick={() => setArquivos((atuais) => atuais.filter((x) => x !== a))}
                    >
                      Remover
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="secao-contato" className="space-y-4">
        <h2 id="secao-contato" className="text-sm font-semibold">
          Contato
        </h2>
        <CampoForm control={form.control} name="contato" rotulo="Contato">
          {(field, controle) => (
            <Input
              id={controle.id}
              value={field.value ?? ''}
              onBlur={field.onBlur}
              onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.value)}
              aria-invalid={controle['aria-invalid']}
              aria-describedby={controle['aria-describedby']}
            />
          )}
        </CampoForm>
        <CampoForm control={form.control} name="contatoEmail" rotulo="E-mail de contato">
          {(field, controle) => (
            <Input
              id={controle.id}
              type="email"
              value={field.value ?? ''}
              onBlur={field.onBlur}
              onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.value)}
              aria-invalid={controle['aria-invalid']}
              aria-describedby={controle['aria-describedby']}
            />
          )}
        </CampoForm>
        <CampoForm control={form.control} name="telefone" rotulo="Telefone">
          {(field, controle) => (
            <Input
              id={controle.id}
              type="tel"
              value={field.value ?? ''}
              onBlur={field.onBlur}
              onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.value)}
              aria-invalid={controle['aria-invalid']}
              aria-describedby={controle['aria-describedby']}
            />
          )}
        </CampoForm>
      </section>

      {equipe || podeEmNome ? (
        <section aria-labelledby="secao-equipe" className="space-y-4">
          <h2 id="secao-equipe" className="text-sm font-semibold">
            Atendimento
          </h2>
          {podeEmNome ? (
            <CampoForm
              control={form.control}
              name="solicitanteId"
              rotulo="Abrir em nome de"
              descricao="Deixe vazio para abrir em seu nome."
            >
              {(field, controle) => (
                <ComboboxField
                  id={controle.id}
                  valor={paraTexto(field.value)}
                  aoMudar={(v) => field.onChange(paraNumero(v))}
                  buscar={opcoesDeUsuarios}
                  placeholder="Eu mesmo"
                  placeholderBusca="Buscar usuário (2+ letras)..."
                  textoVazio="Digite ao menos 2 letras."
                  limpavel
                  aria-invalid={controle['aria-invalid']}
                  aria-describedby={controle['aria-describedby']}
                />
              )}
            </CampoForm>
          ) : null}
          {equipe ? (
            <>
              <CampoForm control={form.control} name="canalId" rotulo="Canal">
                {(field, controle) => (
                  <ComboboxField
                    id={controle.id}
                    valor={paraTexto(field.value)}
                    aoMudar={(v) => field.onChange(paraNumero(v))}
                    opcoes={meta.canais.map((c) => ({ valor: String(c.id), rotulo: c.nome }))}
                    placeholder="Nenhum canal"
                    placeholderBusca="Buscar canal..."
                    limpavel
                    aria-invalid={controle['aria-invalid']}
                    aria-describedby={controle['aria-describedby']}
                  />
                )}
              </CampoForm>
              <CampoForm control={form.control} name="tags" rotulo="Tags">
                {(field, controle) => (
                  <MultiComboboxField
                    id={controle.id}
                    valores={field.value ?? []}
                    aoMudar={(valores) => field.onChange(valores.length > 0 ? valores : undefined)}
                    opcoes={(meta.tags ?? []).map((t) => ({ valor: t.nome, rotulo: t.nome }))}
                    placeholder="Nenhuma tag"
                    placeholderBusca="Buscar tag..."
                    aria-invalid={controle['aria-invalid']}
                    aria-describedby={controle['aria-describedby']}
                  />
                )}
              </CampoForm>
            </>
          ) : null}
        </section>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={formState.isSubmitting || criar.isPending || envio !== null}>
          {envio ? `Enviando anexo ${envio.indice + 1} de ${arquivos.length}…` : 'Abrir chamado'}
        </Button>
      </div>
    </form>
  )
}
