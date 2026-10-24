import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Printer } from 'lucide-react'
import { createPortal } from 'react-dom'
import { KeyValueGrid, type KeyValueItem } from '@/components/display/key-value-grid'
import { ErrorState } from '@/components/feedback/error-state'
import { Button } from '@/components/ui/button'
import { chamadosConsultas } from '@/features/chamados/queries'
import { comentariosPublicosConsulta } from '@/features/historico/queries'
import { formatarDataHora } from '@/lib/datas'
import { ROTULOS_NOTA_AVALIACAO } from '@/lib/rotulos'

/**
 * Impressão com layout fixo (C23). A prévia vai para `document.body` e esconde o `#root` (app bar, abas e
 * trilho) só na impressão; o botão "Imprimir" e o "Voltar" têm `data-print="ocultar"`.
 */
const CSS_IMPRESSAO = `
@media print {
  #root { display: none !important; }
  [data-print-area] { position: static !important; inset: auto !important; overflow: visible !important; height: auto !important; }
}
`

export const Route = createFileRoute('/_app/chamados/$chamadoId/imprimir')({
  component: ImprimirChamado,
})

const data = (d: Date | null) => (d ? formatarDataHora(d) : '—')

function ImprimirChamado() {
  const { chamadoId } = Route.useParams()
  const { data: detalhe } = useSuspenseQuery(chamadosConsultas.detalhe(chamadoId))
  const comentarios = useQuery(comentariosPublicosConsulta(chamadoId))

  const itens: KeyValueItem[] = [
    { rotulo: 'Status', valor: detalhe.status.nome },
    { rotulo: 'Prioridade', valor: detalhe.prioridade.nome },
    { rotulo: 'Área', valor: detalhe.area.nome },
    { rotulo: 'Problema', valor: detalhe.problema?.nome ?? '—' },
    { rotulo: 'Solicitante', valor: detalhe.solicitante.nome },
    { rotulo: 'Aberto por', valor: detalhe.abertoPor.nome },
    { rotulo: 'Operador', valor: detalhe.operador?.nome ?? 'Sem responsável' },
    { rotulo: 'Aberto em', valor: data(detalhe.abertoEm) },
    { rotulo: 'Concluído em', valor: data(detalhe.concluidoEm) },
    { rotulo: 'Encerrado em', valor: data(detalhe.encerradoEm) },
  ]

  return createPortal(
    <div
      data-print="expandir"
      data-print-area
      className="fixed inset-0 z-50 overflow-y-auto bg-white text-black [--muted-foreground:oklch(0.45_0.016_268)]"
    >
      <style>{CSS_IMPRESSAO}</style>
      <div data-print="ocultar" className="sticky top-0 flex justify-between gap-2 border-b bg-white p-3">
        <Button asChild variant="outline">
          <Link to="/chamados/$chamadoId" params={{ chamadoId }}>
            <ArrowLeft aria-hidden />
            Voltar
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer aria-hidden />
          Imprimir
        </Button>
      </div>

      <article className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
        <header className="flex flex-col gap-1">
          <p className="font-mono text-sm">Chamado #{detalhe.id}</p>
          <h1 className="text-2xl font-semibold">{detalhe.assunto}</h1>
        </header>

        <KeyValueGrid itens={itens} colunas={2} />

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Descrição</h2>
          <p className="whitespace-pre-wrap">{detalhe.descricao}</p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Comentários públicos</h2>
          {comentarios.isPending ? <p>Carregando comentários…</p> : null}
          {comentarios.isError ? (
            <ErrorState erro={comentarios.error} aoTentarNovamente={() => void comentarios.refetch()} />
          ) : null}
          {comentarios.data?.length === 0 ? <p>Sem comentários públicos.</p> : null}
          {comentarios.data?.map((c) => (
            <div key={c.id} className="flex flex-col gap-0.5 border-b pb-2">
              <p className="text-sm">
                {c.autor?.nome ?? 'Sistema'} · {formatarDataHora(c.criadoEm)}
              </p>
              <p className="whitespace-pre-wrap">{c.texto}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Solução</h2>
          <p className="whitespace-pre-wrap">{detalhe.solucao ?? 'Sem solução registrada.'}</p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Avaliação</h2>
          {detalhe.avaliacao ? (
            <>
              <p>{ROTULOS_NOTA_AVALIACAO[detalhe.avaliacao.nota]}</p>
              {detalhe.avaliacao.comentario ? (
                <p className="whitespace-pre-wrap">{detalhe.avaliacao.comentario}</p>
              ) : null}
              <p className="text-sm">Registrada em {formatarDataHora(detalhe.avaliacao.criadoEm)}</p>
            </>
          ) : (
            <p>Sem avaliação.</p>
          )}
        </section>
      </article>
    </div>,
    document.body,
  )
}
