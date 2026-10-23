import { useQuery, useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { chamadosConsultas } from '@/features/chamados/queries'
import { metaConsultas } from '@/features/meta/queries'
import type { ItemConversa } from '../cache'
import { conversaConsultas, useEnviarComentario } from '../queries'
import { Composer } from './composer'
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
  const { sessao } = useRouteContext({ from: '/_app' })
  const { data: detalhe } = useSuspenseQuery(chamadosConsultas.detalhe(chamadoId))
  const { data: meta } = useQuery(metaConsultas.tudo())
  const usuario = sessao.usuario
  const envio = useEnviarComentario(chamadoId, { id: usuarioId, nome: usuario?.nome ?? '' })
  const [anexos, setAnexos] = useState<File[]>([])
  const anexosHabilitados = meta?.config['anexos.habilitados'] === true && detalhe.acoes.anexar
  const consulta = useSuspenseInfiniteQuery(conversaConsultas.lista(chamadoId))
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = consulta
  // Páginas vêm da mais recente para a mais antiga; cada uma já está em ordem crescente.
  const itens = useMemo(() => [...data.pages].reverse().flatMap((p) => p.itens), [data.pages])
  const raiz = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
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
    if (ultimo.estado === 'enviando' && ultimo.autor?.id === usuarioId) {
      rolagem.scrollTop = rolagem.scrollHeight
    } else if (inicial.current && foco === undefined) {
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

  // Arrastar arquivos sobre a conversa anexa ao comentário (listeners no DOM: a área não é um controle).
  useEffect(() => {
    const el = area.current
    if (!el || !anexosHabilitados) return
    const aoArrastar = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const aoSoltar = (e: DragEvent) => {
      e.preventDefault()
      const soltos = Array.from(e.dataTransfer?.files ?? [])
      if (soltos.length > 0) setAnexos((atual) => [...atual, ...soltos])
    }
    el.addEventListener('dragover', aoArrastar)
    el.addEventListener('drop', aoSoltar)
    return () => {
      el.removeEventListener('dragover', aoArrastar)
      el.removeEventListener('drop', aoSoltar)
    }
  }, [anexosHabilitados])

  function reenviar(item: ItemConversa) {
    void envio.enviar({
      texto: item.texto,
      interno: item.interno,
      arquivos: item.arquivos ?? [],
      ...(item.clienteId ? { clienteId: item.clienteId } : {}),
    })
  }

  const podeComentar = detalhe.acoes.comentar
  return (
    <div ref={area} className="flex min-h-full flex-col">
      <div ref={raiz} className="flex flex-1 flex-col gap-4 p-4">
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
          aoTentarNovamente={reenviar}
          aoDescartar={envio.descartar}
        />
        <NewMessagesPill quantidade={novas} aoClicar={irParaOFim} />
      </div>
      {podeComentar && usuario ? (
        <div className="sticky bottom-0">
          <Composer
            chamadoId={chamadoId}
            enviarComEnter={usuario.enviarComEnter}
            podeInterno={detalhe.acoes.comentarInterno}
            podeAnexar={anexosHabilitados}
            anexos={anexos}
            aoMudarAnexos={setAnexos}
            aoEnviar={(e) => void envio.enviar(e)}
          />
        </div>
      ) : null}
    </div>
  )
}
