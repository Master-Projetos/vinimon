import { createFileRoute, Outlet } from '@tanstack/react-router'
import { TIPOS_RELATORIO } from '@vinimon/shared'
import { ErrorState } from '@/components/feedback/error-state'
import { RouteTabs } from '@/components/layout/route-tabs'
import { exigir } from '@/features/auth/guards'
import { ROTULOS_RELATORIO } from '@/features/relatorios/queries'

export const Route = createFileRoute('/_app/relatorios')({
  beforeLoad: ({ context }) => exigir('relatorio.ver')(context),
  component: RelatoriosLayout,
  errorComponent: ({ error, reset }) => <ErrorState erro={error} aoTentarNovamente={reset} />,
})

/**
 * Impressão sem o shell: esconde o resto da página e deixa só `.relatorio-impressao` (fixo, cobrindo a folha).
 * O shell (topbar, app bar) não tem marcação de impressão, então é escondido pelo `visibility` do `body`.
 */
const CSS_IMPRESSAO = `@media print {
  body * { visibility: hidden !important; }
  .relatorio-impressao, .relatorio-impressao * { visibility: visible !important; }
  .relatorio-impressao { position: fixed !important; inset: 0 !important; overflow: visible !important; background: #fff; }
}`

function RelatoriosLayout() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <style>{CSS_IMPRESSAO}</style>
      <div data-print="ocultar" className="px-(--pane-px)">
        <RouteTabs
          rotulo="Tipos de relatório"
          itens={TIPOS_RELATORIO.map((tipo) => ({
            to: '/relatorios/$relatorio',
            params: { relatorio: tipo },
            rotulo: ROTULOS_RELATORIO[tipo],
          }))}
        />
      </div>
      <div className="relatorio-impressao flex min-h-0 flex-1 flex-col overflow-y-auto" data-print="expandir">
        <Outlet />
      </div>
    </div>
  )
}
