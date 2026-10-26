import { type Config, ConfigSchema } from '@vinimon/shared'
import type { FormEvent, ReactNode } from 'react'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSalvarConfig } from '@/features/config/queries'
import { ErroApi } from '@/lib/api'
import { useZodForm } from '@/lib/form'
import { ROTULOS_NOTA_AVALIACAO } from '@/lib/rotulos'

/** Quadro de uma seção: título, formulário próprio e botão Salvar. */
export function ConfiguracoesSecao({
  id,
  titulo,
  descricao,
  salvando,
  aoEnviar,
  children,
}: {
  id: string
  titulo: string
  descricao: string
  salvando: boolean
  aoEnviar: (e: FormEvent<HTMLFormElement>) => void
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-3 rounded-lg border p-4">
      <header>
        <h2 id={`${id}-titulo`} className="text-base font-semibold">
          {titulo}
        </h2>
        <p className="text-muted-foreground text-xs">{descricao}</p>
      </header>
      <form onSubmit={aoEnviar} className="grid gap-4 sm:max-w-md" noValidate aria-label={titulo}>
        {children}
        <div>
          <Button type="submit" disabled={salvando}>
            Salvar {titulo.toLowerCase()}
          </Button>
        </div>
      </form>
    </section>
  )
}

/** 400 com `detalhes` (chaves completas, ex.: `sessao.horasAbsoluta`) → erro no campo curto do formulário. */
function erroNoCampo<T extends FieldValues>(
  setError: UseFormSetError<T>,
  erro: unknown,
  curtas: Record<string, string>,
) {
  if (erro instanceof ErroApi && erro.detalhes.length > 0) {
    for (const d of erro.detalhes) {
      setError((curtas[d.campo] ?? d.campo) as Path<T>, { type: 'server', message: d.mensagem })
    }
    return
  }
  toast.error(erro instanceof Error ? erro.message : 'Não foi possível salvar as configurações. Tente novamente.')
}

const numero = (valor: string): number | undefined => (valor === '' ? undefined : Number(valor))

interface PropsSecao {
  config: Config
}

// ---------------------------------------------------------------- Geral

const GeralSchema = z.object({
  nome: ConfigSchema.shape['sistema.nome'],
  organizacao: ConfigSchema.shape['sistema.organizacao'],
  fusoHorario: ConfigSchema.shape['sistema.fusoHorario'],
})
const CURTAS_GERAL = {
  'sistema.nome': 'nome',
  'sistema.organizacao': 'organizacao',
  'sistema.fusoHorario': 'fusoHorario',
}

export function SecaoGeral({ config }: PropsSecao) {
  const salvar = useSalvarConfig()
  const form = useZodForm(GeralSchema, {
    values: {
      nome: config['sistema.nome'],
      organizacao: config['sistema.organizacao'],
      fusoHorario: config['sistema.fusoHorario'],
    },
  })
  const enviar = form.handleSubmit(async (d) => {
    try {
      await salvar.mutateAsync({
        'sistema.nome': d.nome,
        'sistema.organizacao': d.organizacao,
        'sistema.fusoHorario': d.fusoHorario,
      })
      toast.success('Configurações gerais salvas')
    } catch (erro) {
      erroNoCampo(form.setError, erro, CURTAS_GERAL)
    }
  })
  return (
    <ConfiguracoesSecao
      id="geral"
      titulo="Geral"
      descricao="Identificação do sistema e fuso horário."
      salvando={form.formState.isSubmitting || salvar.isPending}
      aoEnviar={enviar}
    >
      <CampoForm control={form.control} name="nome" rotulo="Nome do sistema" obrigatorio>
        {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
      </CampoForm>
      <CampoForm control={form.control} name="organizacao" rotulo="Organização" obrigatorio>
        {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
      </CampoForm>
      <CampoForm
        control={form.control}
        name="fusoHorario"
        rotulo="Fuso horário"
        descricao="Formato Região/Cidade, por exemplo America/Sao_Paulo."
        obrigatorio
      >
        {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
      </CampoForm>
    </ConfiguracoesSecao>
  )
}

// ---------------------------------------------------------------- Sessão

const SessaoSchema = z.object({
  horasAbsoluta: ConfigSchema.shape['sessao.horasAbsoluta'],
  minutosInatividade: ConfigSchema.shape['sessao.minutosInatividade'],
})
const CURTAS_SESSAO = {
  'sessao.horasAbsoluta': 'horasAbsoluta',
  'sessao.minutosInatividade': 'minutosInatividade',
}

export function SecaoSessao({ config }: PropsSecao) {
  const salvar = useSalvarConfig()
  const form = useZodForm(SessaoSchema, {
    values: {
      horasAbsoluta: config['sessao.horasAbsoluta'],
      minutosInatividade: config['sessao.minutosInatividade'],
    },
  })
  const enviar = form.handleSubmit(async (d) => {
    try {
      await salvar.mutateAsync({
        'sessao.horasAbsoluta': d.horasAbsoluta,
        'sessao.minutosInatividade': d.minutosInatividade,
      })
      toast.success('Configurações de sessão salvas')
    } catch (erro) {
      erroNoCampo(form.setError, erro, CURTAS_SESSAO)
    }
  })
  return (
    <ConfiguracoesSecao
      id="sessao"
      titulo="Sessão"
      descricao="Quanto tempo uma sessão pode durar."
      salvando={form.formState.isSubmitting || salvar.isPending}
      aoEnviar={enviar}
    >
      <CampoForm
        control={form.control}
        name="horasAbsoluta"
        rotulo="Duração máxima da sessão (horas)"
        descricao="De 1 a 72 horas."
        obrigatorio
      >
        {(field, controle) => (
          <Input
            {...controle}
            type="number"
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={field.value ?? ''}
            onChange={(e) => field.onChange(numero(e.target.value))}
          />
        )}
      </CampoForm>
      <CampoForm
        control={form.control}
        name="minutosInatividade"
        rotulo="Inatividade para encerrar (minutos)"
        descricao="De 15 a 480 minutos."
        obrigatorio
      >
        {(field, controle) => (
          <Input
            {...controle}
            type="number"
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={field.value ?? ''}
            onChange={(e) => field.onChange(numero(e.target.value))}
          />
        )}
      </CampoForm>
    </ConfiguracoesSecao>
  )
}

// ---------------------------------------------------------------- Chamados

const ROTULOS_PRIMEIRA_RESPOSTA = {
  SEMPRE: 'Sempre',
  NUNCA: 'Nunca',
  ESCOLHA: 'Deixar o atendente escolher',
} as const

const ChamadosSchema = z.object({
  primeiraResposta: ConfigSchema.shape['chamado.primeiraRespostaAoEncaminhar'],
  prazoValidacaoDias: ConfigSchema.shape['chamado.prazoValidacaoDias'],
  prazoValidacaoDiasUteis: ConfigSchema.shape['chamado.prazoValidacaoDiasUteis'],
  avaliacaoAutomatica: ConfigSchema.shape['chamado.avaliacaoAutomatica'],
  permitirReabertura: ConfigSchema.shape['chamado.permitirReabertura'],
  prazoReaberturaDias: ConfigSchema.shape['chamado.prazoReaberturaDias'],
})
const CURTAS_CHAMADOS = {
  'chamado.primeiraRespostaAoEncaminhar': 'primeiraResposta',
  'chamado.prazoValidacaoDias': 'prazoValidacaoDias',
  'chamado.prazoValidacaoDiasUteis': 'prazoValidacaoDiasUteis',
  'chamado.avaliacaoAutomatica': 'avaliacaoAutomatica',
  'chamado.permitirReabertura': 'permitirReabertura',
  'chamado.prazoReaberturaDias': 'prazoReaberturaDias',
}

export function SecaoChamados({ config }: PropsSecao) {
  const salvar = useSalvarConfig()
  const form = useZodForm(ChamadosSchema, {
    values: {
      primeiraResposta: config['chamado.primeiraRespostaAoEncaminhar'],
      prazoValidacaoDias: config['chamado.prazoValidacaoDias'],
      prazoValidacaoDiasUteis: config['chamado.prazoValidacaoDiasUteis'],
      avaliacaoAutomatica: config['chamado.avaliacaoAutomatica'],
      permitirReabertura: config['chamado.permitirReabertura'],
      prazoReaberturaDias: config['chamado.prazoReaberturaDias'],
    },
  })
  const enviar = form.handleSubmit(async (d) => {
    try {
      await salvar.mutateAsync({
        'chamado.primeiraRespostaAoEncaminhar': d.primeiraResposta,
        'chamado.prazoValidacaoDias': d.prazoValidacaoDias,
        'chamado.prazoValidacaoDiasUteis': d.prazoValidacaoDiasUteis,
        'chamado.avaliacaoAutomatica': d.avaliacaoAutomatica,
        'chamado.permitirReabertura': d.permitirReabertura,
        'chamado.prazoReaberturaDias': d.prazoReaberturaDias,
      })
      toast.success('Configurações de chamados salvas')
    } catch (erro) {
      erroNoCampo(form.setError, erro, CURTAS_CHAMADOS)
    }
  })
  return (
    <ConfiguracoesSecao
      id="chamados"
      titulo="Chamados"
      descricao="Regras de encaminhamento, validação e reabertura."
      salvando={form.formState.isSubmitting || salvar.isPending}
      aoEnviar={enviar}
    >
      <CampoForm control={form.control} name="primeiraResposta" rotulo="Primeira resposta ao encaminhar">
        {(field, controle) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger {...controle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROTULOS_PRIMEIRA_RESPOSTA).map(([valor, rotulo]) => (
                <SelectItem key={valor} value={valor}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CampoForm>
      <CampoForm
        control={form.control}
        name="prazoValidacaoDias"
        rotulo="Prazo de validação (dias)"
        descricao="De 0 a 30 dias."
        obrigatorio
      >
        {(field, controle) => (
          <Input
            {...controle}
            type="number"
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={field.value ?? ''}
            onChange={(e) => field.onChange(numero(e.target.value))}
          />
        )}
      </CampoForm>
      <CampoForm control={form.control} name="prazoValidacaoDiasUteis" rotulo="Validação em dias úteis">
        {(field, controle) => (
          <Switch
            id={controle.id}
            aria-describedby={controle['aria-describedby']}
            checked={field.value}
            onCheckedChange={field.onChange}
          />
        )}
      </CampoForm>
      <CampoForm control={form.control} name="avaliacaoAutomatica" rotulo="Avaliação automática">
        {(field, controle) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger {...controle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROTULOS_NOTA_AVALIACAO).map(([valor, rotulo]) => (
                <SelectItem key={valor} value={valor}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CampoForm>
      <CampoForm control={form.control} name="permitirReabertura" rotulo="Permitir reabertura">
        {(field, controle) => (
          <Switch
            id={controle.id}
            aria-describedby={controle['aria-describedby']}
            checked={field.value}
            onCheckedChange={field.onChange}
          />
        )}
      </CampoForm>
      <CampoForm
        control={form.control}
        name="prazoReaberturaDias"
        rotulo="Prazo de reabertura (dias)"
        descricao="0 não limita o prazo. Máximo de 365 dias."
        obrigatorio
      >
        {(field, controle) => (
          <Input
            {...controle}
            type="number"
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={field.value ?? ''}
            onChange={(e) => field.onChange(numero(e.target.value))}
          />
        )}
      </CampoForm>
    </ConfiguracoesSecao>
  )
}

// ---------------------------------------------------------------- Anexos e SLA

const NENHUMA = 'nenhuma'

const AnexosSlaSchema = z.object({
  habilitados: ConfigSchema.shape['anexos.habilitados'],
  tamanhoMaxMb: ConfigSchema.shape['anexos.tamanhoMaxMb'],
  maxPorEnvio: ConfigSchema.shape['anexos.maxPorEnvio'],
  jornadaPadraoId: ConfigSchema.shape['sla.jornadaPadraoId'],
  alertaPct: ConfigSchema.shape['sla.alertaPct'],
})
const CURTAS_ANEXOS_SLA = {
  'anexos.habilitados': 'habilitados',
  'anexos.tamanhoMaxMb': 'tamanhoMaxMb',
  'anexos.maxPorEnvio': 'maxPorEnvio',
  'sla.jornadaPadraoId': 'jornadaPadraoId',
  'sla.alertaPct': 'alertaPct',
}

export function SecaoAnexosSla({ config, jornadas }: PropsSecao & { jornadas: { id: number; nome: string }[] }) {
  const salvar = useSalvarConfig()
  const form = useZodForm(AnexosSlaSchema, {
    values: {
      habilitados: config['anexos.habilitados'],
      tamanhoMaxMb: config['anexos.tamanhoMaxMb'],
      maxPorEnvio: config['anexos.maxPorEnvio'],
      jornadaPadraoId: config['sla.jornadaPadraoId'],
      alertaPct: config['sla.alertaPct'],
    },
  })
  const enviar = form.handleSubmit(async (d) => {
    try {
      await salvar.mutateAsync({
        'anexos.habilitados': d.habilitados,
        'anexos.tamanhoMaxMb': d.tamanhoMaxMb,
        'anexos.maxPorEnvio': d.maxPorEnvio,
        'sla.jornadaPadraoId': d.jornadaPadraoId,
        'sla.alertaPct': d.alertaPct,
      })
      toast.success('Configurações de anexos e SLA salvas')
    } catch (erro) {
      erroNoCampo(form.setError, erro, CURTAS_ANEXOS_SLA)
    }
  })
  return (
    <ConfiguracoesSecao
      id="anexos-sla"
      titulo="Anexos e SLA"
      descricao="Limites de envio de arquivos e regras de prazo."
      salvando={form.formState.isSubmitting || salvar.isPending}
      aoEnviar={enviar}
    >
      <CampoForm control={form.control} name="habilitados" rotulo="Anexos habilitados">
        {(field, controle) => (
          <Switch
            id={controle.id}
            aria-describedby={controle['aria-describedby']}
            checked={field.value}
            onCheckedChange={field.onChange}
          />
        )}
      </CampoForm>
      <CampoForm
        control={form.control}
        name="tamanhoMaxMb"
        rotulo="Tamanho máximo (MB)"
        descricao="De 1 a 25 MB."
        obrigatorio
      >
        {(field, controle) => (
          <Input
            {...controle}
            type="number"
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={field.value ?? ''}
            onChange={(e) => field.onChange(numero(e.target.value))}
          />
        )}
      </CampoForm>
      <CampoForm
        control={form.control}
        name="maxPorEnvio"
        rotulo="Máximo de arquivos por envio"
        descricao="De 1 a 5 arquivos."
        obrigatorio
      >
        {(field, controle) => (
          <Input
            {...controle}
            type="number"
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={field.value ?? ''}
            onChange={(e) => field.onChange(numero(e.target.value))}
          />
        )}
      </CampoForm>
      <CampoForm control={form.control} name="jornadaPadraoId" rotulo="Jornada padrão do SLA">
        {(field, controle) => (
          <Select
            value={field.value === null ? NENHUMA : String(field.value)}
            onValueChange={(v) => field.onChange(v === NENHUMA ? null : Number(v))}
          >
            <SelectTrigger {...controle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NENHUMA}>Nenhuma</SelectItem>
              {jornadas.map((j) => (
                <SelectItem key={j.id} value={String(j.id)}>
                  {j.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CampoForm>
      <CampoForm
        control={form.control}
        name="alertaPct"
        rotulo="Alerta de SLA (%)"
        descricao="Percentual do prazo consumido que dispara o alerta, de 50 a 95."
        obrigatorio
      >
        {(field, controle) => (
          <Input
            {...controle}
            type="number"
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={field.value ?? ''}
            onChange={(e) => field.onChange(numero(e.target.value))}
          />
        )}
      </CampoForm>
    </ConfiguracoesSecao>
  )
}
