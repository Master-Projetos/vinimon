import { useQuery } from '@tanstack/react-query'
import { artigosApi } from '@vinimon/shared'
import { Button } from '@/components/ui/button'
import { useDebounce } from '@/hooks/use-debounce'
import { chamar } from '@/lib/api'

const MIN_CARACTERES = 4
const ATRASO_MS = 400

export interface ArtigosSugeridosProps {
  assunto: string
  problemaId: number | undefined
  /** "Isso resolveu": o formulário limpa o rascunho e abre o artigo. */
  aoResolver: (artigoId: number) => void
}

/** "Isto pode resolver": artigos parecidos com o assunto, com debounce de 400 ms e 4+ caracteres (B16). */
export function ArtigosSugeridos({ assunto, problemaId, aoResolver }: ArtigosSugeridosProps) {
  const termo = useDebounce(assunto.trim(), ATRASO_MS)
  const ativo = termo.length >= MIN_CARACTERES
  const sugestoes = useQuery({
    queryKey: ['artigos', 'sugestoes', termo, problemaId ?? null],
    queryFn: ({ signal }) =>
      chamar(artigosApi.sugestoes, { query: { q: termo, ...(problemaId ? { problemaId } : {}) } }, signal),
    enabled: ativo,
    staleTime: 30_000,
  })
  const itens = ativo ? (sugestoes.data ?? []) : []
  if (itens.length === 0) return null
  return (
    <aside aria-label="Artigos sugeridos" className="space-y-2 rounded-md border bg-muted/40 p-3">
      <h3 className="text-sm font-semibold">Isto pode resolver</h3>
      <ul className="space-y-2">
        {itens.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{a.titulo}</p>
              {a.resumo ? <p className="line-clamp-2 text-xs text-muted-foreground">{a.resumo}</p> : null}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => aoResolver(a.id)}>
              Isso resolveu
            </Button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
