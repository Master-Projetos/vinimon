import type { PreferenciaItem, PreferenciasNotificacao } from '@vinimon/shared'
import { Checkbox } from '@/components/ui/checkbox'
import { ROTULOS_TIPO_NOTIFICACAO } from '@/lib/rotulos'

export type LinhaPreferencia = PreferenciasNotificacao['itens'][number]

export interface PreferenciasNotificacaoTableProps {
  itens: LinhaPreferencia[]
  aoMudar: (itens: LinhaPreferencia[]) => void
}

/** Desligar o aviso no aplicativo desliga o da área de trabalho; tipos fixos não saem do aplicativo (§3.8). */
export function aplicarMudanca(
  itens: LinhaPreferencia[],
  tipo: PreferenciaItem['tipo'],
  campo: 'inApp' | 'desktop',
  valor: boolean,
): LinhaPreferencia[] {
  return itens.map((i) => {
    if (i.tipo !== tipo) return i
    if (campo === 'inApp') return { ...i, inApp: valor, desktop: valor ? i.desktop : false }
    return { ...i, desktop: i.inApp && valor }
  })
}

/** Matriz tipo × {No aplicativo, Área de trabalho}. */
export function PreferenciasNotificacaoTable({ itens, aoMudar }: PreferenciasNotificacaoTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">
              Tipo
            </th>
            <th scope="col" className="px-3 py-2 text-center font-medium">
              No aplicativo
            </th>
            <th scope="col" className="px-3 py-2 text-center font-medium">
              Área de trabalho
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => {
            const rotulo = ROTULOS_TIPO_NOTIFICACAO[i.tipo]
            return (
              <tr key={i.tipo} className="border-b last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {rotulo}
                  {i.fixo ? (
                    <span className="ml-2 text-xs text-muted-foreground">(sempre ligado no aplicativo)</span>
                  ) : null}
                </th>
                <td className="px-3 py-2 text-center">
                  <Checkbox
                    aria-label={`${rotulo}, no aplicativo`}
                    checked={i.inApp}
                    disabled={i.fixo}
                    onCheckedChange={(v) => aoMudar(aplicarMudanca(itens, i.tipo, 'inApp', v === true))}
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <Checkbox
                    aria-label={`${rotulo}, na área de trabalho`}
                    checked={i.desktop}
                    disabled={!i.inApp}
                    onCheckedChange={(v) => aoMudar(aplicarMudanca(itens, i.tipo, 'desktop', v === true))}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
