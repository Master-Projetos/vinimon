import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowLeft, QrCode } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { KeyValueGrid } from '@/components/display/key-value-grid'
import { ErrorState } from '@/components/feedback/error-state'
import { NotFoundState } from '@/components/feedback/not-found-state'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AtivoChamados } from '@/features/inventario/components/ativo-chamados'
import { SituacaoAtivoBadge } from '@/features/inventario/components/ativos-table'
import { EtiquetaQrDialog } from '@/features/inventario/components/etiqueta-qr-dialog'
import { ativoDetalheConsultas } from '@/features/inventario/queries'
import { metaConsultas } from '@/features/meta/queries'
import { formatarDataHora } from '@/lib/datas'

export const Route = createFileRoute('/_app/inventario/$ativoId')({
  params: {
    parse: (p) => {
      const resultado = z.coerce.number().int().positive().safeParse(p.ativoId)
      if (!resultado.success) throw notFound()
      return { ativoId: resultado.data }
    },
  },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(ativoDetalheConsultas.detalhe(params.ativoId)),
      context.queryClient.ensureQueryData(metaConsultas.tudo()),
    ])
  },
  errorComponent: ({ error, reset }) => <ErrorState erro={error} aoTentarNovamente={reset} />,
  notFoundComponent: () => (
    <NotFoundState titulo="Ativo não encontrado" descricao="O número informado não é válido ou o ativo não existe." />
  ),
  component: AtivoDetalhe,
})

function AtivoDetalhe() {
  const { ativoId } = Route.useParams()
  const { data: ativo } = useSuspenseQuery(ativoDetalheConsultas.detalhe(ativoId))
  const [qrAberto, setQrAberto] = useState(false)

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Voltar ao inventário">
            <Link to="/inventario">
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
          <h1 className="text-title" tabIndex={-1}>
            {ativo.etiqueta}
          </h1>
          <SituacaoAtivoBadge situacao={ativo.situacao} />
        </div>
        <Button variant="outline" onClick={() => setQrAberto(true)}>
          <QrCode aria-hidden="true" /> Etiqueta QR
        </Button>
      </header>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="chamados">Chamados ({ativo.qtdChamados})</TabsTrigger>
        </TabsList>
        <TabsContent value="dados" className="pt-4">
          <KeyValueGrid
            itens={[
              { rotulo: 'Tipo', valor: ativo.tipo },
              { rotulo: 'Modelo', valor: ativo.modelo ?? '—' },
              { rotulo: 'Série', valor: ativo.serie ?? '—' },
              { rotulo: 'Departamento', valor: ativo.departamento ?? '—' },
              { rotulo: 'Responsável', valor: ativo.responsavelTexto ?? '—' },
              { rotulo: 'Observação', valor: ativo.observacao ?? '—' },
              { rotulo: 'Cadastrado em', valor: formatarDataHora(ativo.criadoEm) },
              { rotulo: 'Atualizado em', valor: formatarDataHora(ativo.atualizadoEm) },
            ]}
          />
        </TabsContent>
        <TabsContent value="chamados" className="pt-4">
          <AtivoChamados ativoId={ativoId} />
        </TabsContent>
      </Tabs>

      <EtiquetaQrDialog etiqueta={ativo.etiqueta} aberto={qrAberto} aoMudarAberto={setQrAberto} />
    </section>
  )
}
