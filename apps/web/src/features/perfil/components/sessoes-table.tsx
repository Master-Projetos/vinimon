import type { SessaoDispositivo } from '@vinimon/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatarDataHora } from '@/lib/datas'

export interface SessoesTableProps {
  sessoes: SessaoDispositivo[]
  ocupado: boolean
  aoEncerrar: (sessao: SessaoDispositivo) => void
  aoEncerrarOutras: () => void
}

/** Sessões abertas da conta, com o selo "Esta sessão" e as ações de encerrar (S24). */
export function SessoesTable({ sessoes, ocupado, aoEncerrar, aoEncerrarOutras }: SessoesTableProps) {
  const temOutras = sessoes.some((s) => !s.atual)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" disabled={!temOutras || ocupado} onClick={aoEncerrarOutras}>
          Encerrar as outras
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">
                Dispositivo
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                IP
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Último uso
              </th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sessoes.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="max-w-64 px-3 py-2">
                  <span className="block truncate" title={s.userAgent ?? undefined}>
                    {s.userAgent ?? 'Dispositivo desconhecido'}
                  </span>
                  {s.atual ? <Badge className="mt-1">Esta sessão</Badge> : null}
                </td>
                <td className="px-3 py-2">{s.ip ?? '—'}</td>
                <td className="px-3 py-2">{formatarDataHora(s.ultimoUsoEm)}</td>
                <td className="px-3 py-2 text-right">
                  {s.atual ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={ocupado}
                      aria-label={`Encerrar sessão de ${s.userAgent ?? 'dispositivo desconhecido'}`}
                      onClick={() => aoEncerrar(s)}
                    >
                      Encerrar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
