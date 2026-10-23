import { useQuery } from '@tanstack/react-query'
import { chamadosApi, type Reincidencia } from '@vinimon/shared'
import { chamar } from '@/lib/api'
import { formatarData } from '@/lib/datas'

export interface ReincidenciaPanelProps {
  ativoId: number | undefined
  problemaId: number | undefined
}

function Lista({ titulo, itens }: { titulo: string; itens: Reincidencia['ativo'] }) {
  if (itens.length === 0) return null
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-muted-foreground">{titulo}</h4>
      <ul className="space-y-1 text-sm">
        {itens.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2">
            <span className="truncate">
              #{c.id} · {c.assunto}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatarData(c.abertoEm)} · {c.emAberto ? 'em aberto' : 'encerrado'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Chamados parecidos recentes do mesmo ativo ou do mesmo solicitante (B17). Some quando não há nada. */
export function ReincidenciaPanel({ ativoId, problemaId }: ReincidenciaPanelProps) {
  const ativo = ativoId !== undefined || problemaId !== undefined
  const dados = useQuery({
    queryKey: ['chamados', 'reincidencia', ativoId ?? null, problemaId ?? null],
    queryFn: ({ signal }) =>
      chamar(
        chamadosApi.reincidencia,
        { query: { ...(ativoId ? { ativoId } : {}), ...(problemaId ? { problemaId } : {}) } },
        signal,
      ),
    enabled: ativo,
    staleTime: 30_000,
  }).data
  if (!ativo || !dados || (dados.ativo.length === 0 && dados.solicitante.length === 0)) return null
  return (
    <aside
      aria-label="Chamados parecidos"
      className="space-y-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3"
    >
      <h3 className="text-sm font-semibold">Já houve chamados parecidos</h3>
      <Lista titulo="Neste equipamento" itens={dados.ativo} />
      <Lista titulo="Abertos por você" itens={dados.solicitante} />
    </aside>
  )
}
