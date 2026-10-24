import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import { BookOpen, Search } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { EmptyState } from '@/components/feedback/empty-state'
import { PaneHeader } from '@/components/layout/pane-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { artigosConsultas } from '@/features/conhecimento/queries'
import { useDebounce } from '@/hooks/use-debounce'
import { formatarData } from '@/lib/datas'

const POR_PAGINA = 25
const layout = getRouteApi('/_app/conhecimento')

export const Route = createFileRoute('/_app/conhecimento/')({
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca, categoriaId: search.categoriaId }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(artigosConsultas.lista({ ...deps, porPagina: POR_PAGINA })),
  component: ListaPagina,
})

/** Destaca o termo buscado sem HTML bruto: parte o texto e envolve os trechos em `<mark>`. */
function Destacar({ texto, termo }: { texto: string; termo: string | undefined }) {
  if (!termo) return texto
  const minusculo = texto.toLocaleLowerCase('pt-BR')
  const alvo = termo.toLocaleLowerCase('pt-BR')
  const partes: { t: string; m: boolean; pos: number }[] = []
  let inicio = 0
  for (let i = minusculo.indexOf(alvo); i !== -1; i = minusculo.indexOf(alvo, inicio)) {
    if (i > inicio) partes.push({ t: texto.slice(inicio, i), m: false, pos: inicio })
    partes.push({ t: texto.slice(i, i + alvo.length), m: true, pos: i })
    inicio = i + alvo.length
  }
  if (inicio < texto.length) partes.push({ t: texto.slice(inicio), m: false, pos: inicio })
  return partes.map((p) => (
    <Fragment key={p.pos}>{p.m ? <mark className="rounded-sm bg-warning-soft px-0.5">{p.t}</mark> : p.t}</Fragment>
  ))
}

function ListaPagina() {
  const search = layout.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(
    artigosConsultas.lista({ pagina, busca: search.busca, categoriaId: search.categoriaId, porPagina: POR_PAGINA }),
  )
  const [texto, setTexto] = useState(search.busca ?? '')
  const termo = useDebounce(texto.trim(), 300)
  useEffect(() => {
    if (termo === (search.busca ?? '')) return
    void navigate({
      search: (anterior) => ({ ...anterior, busca: termo === '' ? undefined : termo, pagina: undefined }),
      replace: true,
    })
  }, [termo, search.busca, navigate])
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <PaneHeader titulo="Base de conhecimento" />
      <div className="space-y-4 overflow-y-auto p-(--pane-px)">
        <div className="relative max-w-md">
          <Search aria-hidden="true" className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Buscar artigos"
            placeholder="Buscar artigos"
            className="pl-9"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        {data.itens.length === 0 ? (
          <EmptyState
            icone={BookOpen}
            titulo="Nenhum artigo encontrado"
            descricao="Não achou o que procurava? Abra um chamado e a equipe ajuda."
            acao={
              <Button asChild>
                <Link to="/chamados/novo">Abrir chamado</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y rounded-md border">
            {data.itens.map((a) => (
              <li key={a.id}>
                <Link
                  to="/conhecimento/$artigoId"
                  params={{ artigoId: a.id }}
                  className="block space-y-1 p-3 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    <Destacar texto={a.titulo} termo={search.busca} />
                    {a.visibilidade === 'INTERNO' ? <Badge variant="secondary">Interno</Badge> : null}
                  </span>
                  {a.resumo ? (
                    <span className="line-clamp-2 block text-sm text-muted-foreground">
                      <Destacar texto={a.resumo} termo={search.busca} />
                    </span>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">
                    Atualizado em {formatarData(a.atualizadoEm)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {totalPaginas > 1 ? (
          <nav aria-label="Paginação" className="flex items-center justify-between text-sm">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1}
              onClick={() => void navigate({ search: (a) => ({ ...a, pagina: pagina - 1 }) })}
            >
              Anterior
            </Button>
            <span>
              Página {pagina} de {totalPaginas}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= totalPaginas}
              onClick={() => void navigate({ search: (a) => ({ ...a, pagina: pagina + 1 }) })}
            >
              Próxima
            </Button>
          </nav>
        ) : null}
      </div>
    </section>
  )
}
