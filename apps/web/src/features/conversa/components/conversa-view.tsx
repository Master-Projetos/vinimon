import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { conversaConsultas } from '../queries'
import { DescricaoInicialCard } from './descricao-inicial-card'
import { MessageList } from './message-list'
import { NewMessagesPill } from './new-messages-pill'

export interface ConversaViewProps {
  chamadoId: number
  usuarioId: number
  descricao: { texto: string; abertoPor: string; solicitante: string; abertoEm: Date }
  /** `?foco=` da URL: id do assentamento a centralizar e destacar. */
  foco?: number | undefined
  aoConsumirFoco: () => void
}

const PERTO_DO_FIM_PX = 80
const MAX_PAGINAS_PARA_FOCO = 5
const DURACAO_DESTAQUE_MS = 2400

/** Primeiro ancestral que rola; cai no pai direto (jsdom não aplica as classes de overflow). */
function acharRolagem(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll') return p
  }
  return el?.parentElement ?? null
}

const pertoDoFim = (r: HTMLElement) => r.scrollHeight - r.scrollTop - r.clientHeight <= PERTO_DO_FIM_PX

export function ConversaView({ chamadoId, usuarioId, descricao, foco, aoConsumirFoco }: ConversaViewProps) {
  const consulta = useSuspenseInfiniteQuery(conversaConsultas.lista(chamadoId))
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = consulta
  // Páginas vêm da mais recente para a mais antiga; cada uma já está em ordem crescente.
  const itens = useMemo(() => [...data.pages].reverse().flatMap((p) => p.itens), [data.pages])
  const raiz = useRef<HTMLDivElement>(null)
  const [novas, setNovas] = useState(0)
  const [focadoId, setFocadoId] = useState<number | null>(null)
  const ancora = useRef<{ altura: number; topo: number } | null>(null)
  const inicial = useRef(true)
  const ultimoId = useRef<number | null>(null)
  const tentativasFoco = useRef(0)

  const carregarAnteriores = useCallback(() => {
    const rolagem = acharRolagem(raiz.current)
    if (rolagem) ancora.current = { altura: rolagem.scrollHeight, topo: rolagem.scrollTop }
    void fetchNextPage()
  }, [fetchNextPage])

  // Depois de carregar páginas antigas, mantém o que a pessoa estava lendo no mesmo lugar.
  useLayoutEffect(() => {
    if (itens.length === 0) return
    const rolagem = acharRolagem(raiz.current)
    const a = ancora.current
    if (rolagem && a) {
      rolagem.scrollTop = a.topo + (rolagem.scrollHeight - a.altura)
      ancora.current = null
    }
  }, [itens])

  // Foco por link: centraliza, destaca e tira o parâmetro da URL. Procura em até 5 páginas anteriores.
  useEffect(() => {
    if (foco === undefined) return
    const carregado = itens.some((i) => i.id === foco)
    const alvo = carregado ? raiz.current?.querySelector<HTMLElement>(`[data-assentamento-id="${foco}"]`) : null
    if (alvo) {
      alvo.scrollIntoView({ block: 'center' })
      setFocadoId(foco)
      aoConsumirFoco()
      inicial.current = false
      const t = setTimeout(() => setFocadoId(null), DURACAO_DESTAQUE_MS)
      return () => clearTimeout(t)
    }
    if (hasNextPage && !isFetchingNextPage && tentativasFoco.current < MAX_PAGINAS_PARA_FOCO) {
      tentativasFoco.current += 1
      void fetchNextPage()
      return
    }
    if (!hasNextPage) aoConsumirFoco()
  }, [foco, itens, hasNextPage, isFetchingNextPage, fetchNextPage, aoConsumirFoco])

  // Primeira carga vai ao fim; mensagem nova rola sozinha se a pessoa está no fim, senão aparece a pílula.
  useEffect(() => {
    const rolagem = acharRolagem(raiz.current)
    const ultimo = itens.at(-1)
    if (!rolagem || !ultimo) return
    if (inicial.current && foco === undefined) {
      rolagem.scrollTop = rolagem.scrollHeight
      inicial.current = false
    } else if (ultimoId.current !== null && ultimo.id > ultimoId.current) {
      const chegaram = itens.filter((i) => i.id > (ultimoId.current ?? 0) && i.autor?.id !== usuarioId).length
      if (pertoDoFim(rolagem)) rolagem.scrollTop = rolagem.scrollHeight
      else if (chegaram > 0) setNovas((n) => n + chegaram)
    }
    ultimoId.current = ultimo.id
  }, [itens, foco, usuarioId])

  useEffect(() => {
    const rolagem = acharRolagem(raiz.current)
    if (!rolagem) return
    const aoRolar = () => {
      if (pertoDoFim(rolagem)) setNovas(0)
    }
    rolagem.addEventListener('scroll', aoRolar)
    return () => rolagem.removeEventListener('scroll', aoRolar)
  }, [])

  function irParaOFim() {
    const rolagem = acharRolagem(raiz.current)
    if (rolagem) rolagem.scrollTop = rolagem.scrollHeight
    setNovas(0)
  }

  return (
    <div ref={raiz} className="flex min-h-full flex-col gap-4 p-4">
      {hasNextPage ? null : (
        <DescricaoInicialCard
          descricao={descricao.texto}
          abertoPor={descricao.abertoPor}
          solicitante={descricao.solicitante}
          abertoEm={descricao.abertoEm}
        />
      )}
      <MessageList
        itens={itens}
        usuarioId={usuarioId}
        focadoId={focadoId}
        temAnteriores={hasNextPage}
        carregandoAnteriores={isFetchingNextPage}
        aoCarregarAnteriores={carregarAnteriores}
      />
      <NewMessagesPill quantidade={novas} aoClicar={irParaOFim} />
    </div>
  )
}
