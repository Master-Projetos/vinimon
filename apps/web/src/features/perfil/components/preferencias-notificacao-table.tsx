import { CANAIS_EMAIL, type CanalEmail, type PreferenciaItem, type PreferenciasNotificacao } from '@vinimon/shared'
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

const ROTULOS_CANAL_EMAIL: Record<CanalEmail, string> = {
  NUNCA: 'Nunca',
  IMEDIATO: 'Imediato',
  RESUMO: 'Resumo diário',
}

export function aplicarEmail(itens: LinhaPreferencia[], tipo: PreferenciaItem['tipo'], email: CanalEmail) {
  return itens.map((i) => (i.tipo === tipo ? { ...i, email } : i))
}

/** Matriz tipo × {No aplicativo, Área de trabalho, E-mail}. */
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
            <th scope="col" className="px-3 py-2 text-center font-medium">
              E-mail
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
                <td className="px-3 py-2 text-center">
                  <select
                    aria-label={`${rotulo}, por e-mail`}
                    className="rounded-md border bg-background px-2 py-1 text-sm"
                    value={i.email}
                    onChange={(e) => {
                      const valor = CANAIS_EMAIL.find((c) => c === e.target.value)
                      if (valor) aoMudar(aplicarEmail(itens, i.tipo, valor))
                    }}
                  >
                    {CANAIS_EMAIL.map((c) => (
                      <option key={c} value={c}>
                        {ROTULOS_CANAL_EMAIL[c]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
