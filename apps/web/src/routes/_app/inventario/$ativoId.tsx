import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, useNavigate, useRouteContext } from '@tanstack/react-router'
import { temPermissao } from '@vinimon/shared'
import { ArrowLeft, QrCode, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { KeyValueGrid } from '@/components/display/key-value-grid'
import { ErrorState } from '@/components/feedback/error-state'
import { NotFoundState } from '@/components/feedback/not-found-state'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExcluirCadastroDialog } from '@/features/admin/components/excluir-cadastro-dialog'
import { AtivoChamados } from '@/features/inventario/components/ativo-chamados'
import { MOTIVO_COM_CHAMADOS, SituacaoAtivoBadge } from '@/features/inventario/components/ativos-table'
import { EtiquetaQrDialog } from '@/features/inventario/components/etiqueta-qr-dialog'
import { ativoDetalheConsultas, useExcluirAtivo } from '@/features/inventario/queries'
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
  const [excluindo, setExcluindo] = useState(false)
  const { sessao } = useRouteContext({ from: '/_app' })
  const navigate = useNavigate()
  const excluir = useExcluirAtivo()
  const perfil = sessao.usuario?.perfil
  const podeExcluir = perfil !== undefined && temPermissao(perfil, 'cadastro.gerenciar')

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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setQrAberto(true)}>
            <QrCode aria-hidden="true" /> Etiqueta QR
          </Button>
          {podeExcluir ? (
            <span title={ativo.qtdChamados > 0 ? MOTIVO_COM_CHAMADOS : undefined}>
              <Button variant="outline" disabled={ativo.qtdChamados > 0} onClick={() => setExcluindo(true)}>
                <Trash2 aria-hidden="true" /> Excluir
              </Button>
            </span>
          ) : null}
        </div>
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

      <ExcluirCadastroDialog
        alvo={excluindo ? { id: ativo.id, nome: ativo.etiqueta } : null}
        tipo="o ativo"
        sucesso="Ativo excluído"
        aviso="Ativos que já têm chamados não podem ser excluídos: use a situação Baixado."
        excluir={async (id) => {
          await excluir.mutateAsync(id)
          await navigate({ to: '/inventario' })
        }}
        aoFechar={() => setExcluindo(false)}
      />
      <EtiquetaQrDialog etiqueta={ativo.etiqueta} aberto={qrAberto} aoMudarAberto={setQrAberto} />
    </section>
  )
}
