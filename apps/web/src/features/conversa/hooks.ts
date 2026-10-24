import { type InfiniteData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AssentamentoSchema, type Leitura, leiturasApi } from '@vinimon/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useSocketEvento } from '@/hooks/use-socket-evento'
import { chamar } from '@/lib/api'
import { tempoRealAtual } from '@/lib/socket'
import { mesclarAssentamento, type PaginaConversa } from './cache'
import { conversaChaves } from './queries'

export const THROTTLE_DIGITANDO_MS = 3_000
export const PARAR_DIGITANDO_MS = 5_000
export const EXPIRA_DIGITANDO_MS = 6_000
export const DEBOUNCE_LEITURA_MS = 1_000

/**
 * Entra na sala do chamado (de novo a cada `connect`), mescla `assentamento:novo` no cache da conversa e trata a
 * perda de acesso: toast e volta para a lista (S93).
 */
export function useSalaDoChamado(chamadoId: number): void {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  useSocketEvento('assentamento:novo', ({ chamadoId: id, assentamento }) => {
    if (id !== chamadoId) return
    const lido = AssentamentoSchema.safeParse(assentamento)
    if (!lido.success) {
      void queryClient.invalidateQueries({ queryKey: conversaChaves.lista(chamadoId) })
      return
    }
    queryClient.setQueryData<InfiniteData<PaginaConversa, number | undefined>>(
      conversaChaves.lista(chamadoId),
      (atual) => (atual ? { ...atual, pages: mesclarAssentamento(atual.pages, lido.data) } : atual),
    )
  })

  useSocketEvento(
    'chamado:acessoRevogado',
    ({ chamadoId: id }) => {
      if (id !== chamadoId) return
      toast.error('Você não tem mais acesso a este chamado')
      queryClient.removeQueries({ queryKey: conversaChaves.lista(chamadoId) })
      void navigate({ to: '/chamados' })
    },
    { chamadoId },
  )
}

export interface Digitando {
  /** Nomes de quem está digitando agora (a recepção expira em 6 s sem novo aviso). */
  nomes: string[]
  /** Chame a cada tecla: avisa no máximo a cada 3 s e dá o "parei" sozinho após 5 s. */
  aoDigitar: (interno: boolean) => void
  /** Blur ou envio: avisa que parou de digitar. */
  aoParar: () => void
}

/** "Está digitando": emissão com throttle e recepção com expiração (TM3). */
export function useDigitando(chamadoId: number, usuarioId: number): Digitando {
  const [pessoas, setPessoas] = useState<Record<number, string>>({})
  const expiracoes = useRef(new Map<number, number>())
  const ultimoAviso = useRef(0)
  const ativo = useRef<{ interno: boolean } | null>(null)
  const timerParar = useRef<number | null>(null)

  useSocketEvento('chamado:digitando', (p) => {
    if (p.chamadoId !== chamadoId || p.usuario.id === usuarioId) return
    const id = p.usuario.id
    const anterior = expiracoes.current.get(id)
    if (anterior !== undefined) window.clearTimeout(anterior)
    const remover = () => {
      expiracoes.current.delete(id)
      setPessoas((atual) => {
        const { [id]: _removido, ...resto } = atual
        return resto
      })
    }
    if (!p.digitando) {
      remover()
      return
    }
    setPessoas((atual) => ({ ...atual, [id]: p.usuario.nome }))
    expiracoes.current.set(id, window.setTimeout(remover, EXPIRA_DIGITANDO_MS))
  })

  const emitir = useCallback(
    (interno: boolean, digitando: boolean) => {
      tempoRealAtual()?.socket.emitir('chamado:digitando', { chamadoId, interno, digitando })
    },
    [chamadoId],
  )

  const aoParar = useCallback(() => {
    if (timerParar.current !== null) window.clearTimeout(timerParar.current)
    timerParar.current = null
    if (ativo.current) emitir(ativo.current.interno, false)
    ativo.current = null
    ultimoAviso.current = 0
  }, [emitir])

  const aoDigitar = useCallback(
    (interno: boolean) => {
      const agora = Date.now()
      if (ativo.current && ativo.current.interno !== interno) emitir(ativo.current.interno, false)
      if (!ativo.current || ativo.current.interno !== interno || agora - ultimoAviso.current >= THROTTLE_DIGITANDO_MS) {
        emitir(interno, true)
        ultimoAviso.current = agora
      }
      ativo.current = { interno }
      if (timerParar.current !== null) window.clearTimeout(timerParar.current)
      timerParar.current = window.setTimeout(aoParar, PARAR_DIGITANDO_MS)
    },
    [emitir, aoParar],
  )

  useEffect(() => {
    const timers = expiracoes.current
    return () => {
      aoParar()
      for (const t of timers.values()) window.clearTimeout(t)
      timers.clear()
    }
  }, [aoParar])

  return { nomes: Object.values(pessoas), aoDigitar, aoParar }
}

export const leiturasChave = (chamadoId: number) => [...conversaChaves.lista(chamadoId), 'leituras'] as const

/**
 * Leituras do chamado: lista inicial, `chamado:leitura` ao vivo e o envio do próprio "li até aqui" com debounce de 1 s,
 * só com o sentinela do fim visível, a aba visível e a janela com foco (TM4, S98).
 */
export function useLeituras(chamadoId: number, ultimoId: number | null) {
  const queryClient = useQueryClient()
  const leituras = useQuery({
    queryKey: leiturasChave(chamadoId),
    queryFn: ({ signal }) => chamar(leiturasApi.listar, { params: { id: chamadoId } }, signal),
  })

  useSocketEvento('chamado:leitura', (p) => {
    if (p.chamadoId !== chamadoId) return
    const conhecido = queryClient
      .getQueryData<Leitura[]>(leiturasChave(chamadoId))
      ?.some((l) => l.usuario.id === p.usuarioId)
    if (!conhecido) {
      void queryClient.invalidateQueries({ queryKey: leiturasChave(chamadoId) })
      return
    }
    queryClient.setQueryData<Leitura[]>(leiturasChave(chamadoId), (atual) =>
      atual?.map((l) =>
        l.usuario.id === p.usuarioId
          ? { ...l, ultimoAssentamentoId: p.ultimoAssentamentoId, lidoEm: new Date(p.lidoEm) }
          : l,
      ),
    )
  })

  const marcar = useMutation({
    mutationFn: (assentamentoId: number) =>
      chamar(leiturasApi.marcar, { params: { id: chamadoId }, body: { assentamentoId } }),
  })

  const [sentinela, setSentinela] = useState<HTMLElement | null>(null)
  const [visivel, setVisivel] = useState(false)
  const [janelaAtiva, setJanelaAtiva] = useState(() => document.visibilityState === 'visible' && document.hasFocus())
  const ultimoMarcado = useRef(0)

  useEffect(() => {
    if (!sentinela) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisivel(true)
      return
    }
    const observador = new IntersectionObserver((entradas) => {
      setVisivel(entradas.some((e) => e.isIntersecting))
    })
    observador.observe(sentinela)
    return () => observador.disconnect()
  }, [sentinela])

  useEffect(() => {
    const atualizar = () => setJanelaAtiva(document.visibilityState === 'visible' && document.hasFocus())
    window.addEventListener('focus', atualizar)
    window.addEventListener('blur', atualizar)
    document.addEventListener('visibilitychange', atualizar)
    return () => {
      window.removeEventListener('focus', atualizar)
      window.removeEventListener('blur', atualizar)
      document.removeEventListener('visibilitychange', atualizar)
    }
  }, [])

  const { mutate } = marcar
  useEffect(() => {
    if (!visivel || !janelaAtiva || ultimoId === null || ultimoId <= ultimoMarcado.current) return
    const t = window.setTimeout(() => {
      ultimoMarcado.current = ultimoId
      mutate(ultimoId)
    }, DEBOUNCE_LEITURA_MS)
    return () => window.clearTimeout(t)
  }, [visivel, janelaAtiva, ultimoId, mutate])

  return { leituras: leituras.data ?? [], refSentinela: setSentinela }
}
