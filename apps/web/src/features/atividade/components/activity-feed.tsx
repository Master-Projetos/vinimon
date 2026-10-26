import { useInfiniteQuery } from '@tanstack/react-query'
import type { FiltroNotificacao, NotificacaoDTO } from '@vinimon/shared'
import { Inbox } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { PageSkeleton } from '@/components/feedback/page-skeleton'
import { Button } from '@/components/ui/button'
import { notificacaoConsultas, useMarcarLida } from '@/features/notificacoes/queries'
import { ActivityFilters } from './activity-filters'
import { ActivityItem } from './activity-item'
import { ActivityPreview } from './activity-preview'

export interface ActivityFeedProps {
  filtro: FiltroNotificacao
  item: number | undefined
  aoMudar: (proximo: { filtro?: FiltroNotificacao | undefined; item?: number | undefined }) => void
}

function emCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false
  return alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)
}

export function ActivityFeed({ filtro, item, aoMudar }: ActivityFeedProps) {
  const lista = useInfiniteQuery(notificacaoConsultas.lista(filtro))
  const marcar = useMarcarLida()
  const sentinela = useRef<HTMLDivElement | null>(null)
  const itens = lista.data?.pages.flatMap((p) => p.itens) ?? []
  const selecionado = itens.find((n) => n.id === item)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = lista

  const abrir = useCallback(
    (n: NotificacaoDTO) => {
      aoMudar({ item: n.id })
      if (!n.lida) marcar.mutate(n)
    },
    [aoMudar, marcar],
  )

  // Rolagem infinita; o jsdom não tem IntersectionObserver, então a ausência é tratada (há o botão "Carregar mais").
  useEffect(() => {
    const alvo = sentinela.current
    if (!alvo || typeof IntersectionObserver === 'undefined') return
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting) && hasNextPage && !isFetchingNextPage) void fetchNextPage()
    })
    observador.observe(alvo)
    return () => observador.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // j/k navegam entre os itens.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || emCampoDeTexto(e.target)) return
      if (e.key !== 'j' && e.key !== 'k') return
      if (itens.length === 0) return
      const atual = itens.findIndex((n) => n.id === item)
      const indice = e.key === 'j' ? Math.min(atual + 1, itens.length - 1) : Math.max(atual - 1, 0)
      const alvo = itens[indice]
      if (!alvo) return
      e.preventDefault()
      aoMudar({ item: alvo.id })
      document.querySelector<HTMLElement>(`[data-item-id="${alvo.id}"]`)?.scrollIntoView?.({ block: 'nearest' })
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [itens, item, aoMudar])

  return (
    <section className="flex flex-col gap-4 p-(--pane-px)">
      <header className="flex flex-col gap-3 pt-4">
        <h1 className="text-title" tabIndex={-1}>
          Atividade
        </h1>
        <ActivityFilters valor={filtro} aoMudar={(f) => aoMudar({ filtro: f, item: undefined })} />
      </header>
      {lista.isPending ? (
        <PageSkeleton />
      ) : lista.isError ? (
        <ErrorState erro={lista.error} aoTentarNovamente={() => void lista.refetch()} />
      ) : itens.length === 0 ? (
        <EmptyState icone={Inbox} titulo="Nada por aqui" descricao="Nenhuma atividade para este filtro." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ul className="flex flex-col gap-1" aria-label="Atividade recente">
            {itens.map((n) => (
              <li key={n.id}>
                <ActivityItem notificacao={n} selecionado={n.id === item} aoAbrir={abrir} />
              </li>
            ))}
            <li>
              <div ref={sentinela} />
              {hasNextPage ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  {isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
                </Button>
              ) : null}
            </li>
          </ul>
          <div className="rounded-md border">
            <ActivityPreview notificacao={selecionado} />
          </div>
        </div>
      )}
    </section>
  )
}
