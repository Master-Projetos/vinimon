import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { Config } from '@vinimon/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  ConfiguracoesSecao,
  SecaoAnexosSla,
  SecaoChamados,
  SecaoGeral,
  SecaoSessao,
} from '@/features/admin/components/configuracoes-secao'
import { configConsultas, useSalvarConfig, useTestarLdap } from '@/features/config/queries'
import { metaConsultas } from '@/features/meta/queries'
import { ErroApi } from '@/lib/api'
import { useZodForm } from '@/lib/form'

export const Route = createFileRoute('/_app/admin/configuracoes')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(configConsultas.obter()),
      context.queryClient.ensureQueryData(metaConsultas.tudo()),
    ])
  },
  component: ConfiguracoesPagina,
})

function ConfiguracoesPagina() {
  const { data: config } = useSuspenseQuery(configConsultas.obter())
  const { data: meta } = useSuspenseQuery(metaConsultas.tudo())
  return (
    <div className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center">
        <h1 className="text-title" tabIndex={-1}>
          Configurações
        </h1>
      </header>
      <SecaoGeral config={config} />
      <SecaoSessao config={config} />
      <SecaoChamados config={config} />
      <SecaoAcesso config={config} />
      <SecaoAnexosSla config={config} jornadas={meta.jornadas} />
    </div>
  )
}

const AcessoSchema = z.object({
  isolarAreas: z.boolean(),
  operadorTrataProprio: z.boolean(),
  usuarioAbreParaOutros: z.boolean(),
})

const CURTAS_ACESSO: Record<string, 'isolarAreas' | 'operadorTrataProprio' | 'usuarioAbreParaOutros'> = {
  'chamado.isolarAreas': 'isolarAreas',
  'chamado.operadorTrataProprio': 'operadorTrataProprio',
  'chamado.usuarioAbreParaOutros': 'usuarioAbreParaOutros',
}

function SecaoAcesso({ config }: { config: Config }) {
  const salvar = useSalvarConfig()
  const testar = useTestarLdap()
  const [resultadoLdap, setResultadoLdap] = useState<{ ok: boolean; mensagem: string } | null>(null)
  const form = useZodForm(AcessoSchema, {
    values: {
      isolarAreas: config['chamado.isolarAreas'],
      operadorTrataProprio: config['chamado.operadorTrataProprio'],
      usuarioAbreParaOutros: config['chamado.usuarioAbreParaOutros'],
    },
  })
  const enviar = form.handleSubmit(async (d) => {
    try {
      await salvar.mutateAsync({
        'chamado.isolarAreas': d.isolarAreas,
        'chamado.operadorTrataProprio': d.operadorTrataProprio,
        'chamado.usuarioAbreParaOutros': d.usuarioAbreParaOutros,
      })
      toast.success('Configurações de acesso salvas')
    } catch (erro) {
      if (erro instanceof ErroApi && erro.detalhes.length > 0) {
        for (const det of erro.detalhes) {
          const campo = CURTAS_ACESSO[det.campo]
          if (campo) form.setError(campo, { type: 'server', message: det.mensagem })
        }
        return
      }
      toast.error(erro instanceof Error ? erro.message : 'Não foi possível salvar as configurações. Tente novamente.')
    }
  })
  const testarLdap = async () => {
    try {
      setResultadoLdap(await testar.mutateAsync())
    } catch (erro) {
      setResultadoLdap({ ok: false, mensagem: erro instanceof Error ? erro.message : 'Falha ao testar o LDAP.' })
    }
  }
  const interruptor = (
    name: 'isolarAreas' | 'operadorTrataProprio' | 'usuarioAbreParaOutros',
    rotulo: string,
    descricao: string,
  ) => (
    <CampoForm control={form.control} name={name} rotulo={rotulo} descricao={descricao}>
      {(field, controle) => (
        <Switch
          id={controle.id}
          aria-describedby={controle['aria-describedby']}
          checked={field.value}
          onCheckedChange={field.onChange}
        />
      )}
    </CampoForm>
  )
  return (
    <ConfiguracoesSecao
      id="acesso"
      titulo="Acesso"
      descricao="Quem enxerga e quem trata chamados, e a conexão com o diretório."
      salvando={form.formState.isSubmitting || salvar.isPending}
      aoEnviar={enviar}
    >
      {interruptor('isolarAreas', 'Isolar áreas', 'Cada área só enxerga os chamados das suas áreas.')}
      {interruptor(
        'operadorTrataProprio',
        'Operador trata o próprio chamado',
        'Desligado, o operador não atende o chamado em que ele é o solicitante.',
      )}
      {interruptor(
        'usuarioAbreParaOutros',
        'Usuário abre chamado para outros',
        'Permite abrir chamado em nome de alguém do mesmo departamento.',
      )}
      <div className="space-y-2">
        <Button type="button" variant="outline" onClick={testarLdap} disabled={testar.isPending}>
          Testar LDAP
        </Button>
        {resultadoLdap ? (
          <p role="status" className={resultadoLdap.ok ? 'text-xs' : 'text-destructive text-xs'}>
            {resultadoLdap.mensagem}
          </p>
        ) : null}
      </div>
    </ConfiguracoesSecao>
  )
}
