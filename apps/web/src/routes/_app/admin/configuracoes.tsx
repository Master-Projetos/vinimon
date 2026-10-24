import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { SecaoAnexosSla, SecaoChamados, SecaoGeral, SecaoSessao } from '@/features/admin/components/configuracoes-secao'
import { configConsultas } from '@/features/config/queries'
import { metaConsultas } from '@/features/meta/queries'

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
      <SecaoAnexosSla config={config} jornadas={meta.jornadas} />
    </div>
  )
}
