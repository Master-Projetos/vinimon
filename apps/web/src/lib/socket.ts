import type { QueryClient } from '@tanstack/react-query'
import type { EventosCliente, EventosServidor } from '@vinimon/shared'
import { io, type Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { chamadoChaves } from '@/features/chamados/queries'
import { limparDadosDoUsuario } from '@/lib/storage'

/** Erro de `connect_error`: o servidor manda o código do handshake em `data.codigo` (§3.7). */
export interface ErroConexao {
  message: string
  data?: unknown
}

type EventoConexao = 'connect' | 'disconnect' | 'connect_error'

/**
 * Parte do socket que o app usa. O socket real é adaptado a isto por `criarSocketReal`; nos testes entra um duplo
 * (EventEmitter) no lugar, sem rede.
 */
export interface SocketCliente {
  readonly conectado: boolean
  conectar: () => void
  desconectar: () => void
  aoEvento: (evento: EventoConexao, ouvinte: (erro?: ErroConexao) => void) => () => void
  ouvir: <E extends keyof EventosServidor>(
    evento: E,
    ouvinte: (...args: Parameters<EventosServidor[E]>) => void,
  ) => () => void
  emitir: <E extends keyof EventosCliente>(evento: E, ...args: Parameters<EventosCliente[E]>) => void
}

export type EstadoConexao = 'inicial' | 'conectado' | 'desconectado'

export interface DepsTempoReal {
  socket: SocketCliente
  queryClient: QueryClient
  irParaLogin: () => void
  avisar?: (mensagem: string) => void
}

export interface TempoReal {
  readonly socket: SocketCliente
  estado: () => EstadoConexao
  /** Inscreve-se nas mudanças de estado (para `useSyncExternalStore`). */
  assinarEstado: (ouvinte: () => void) => () => void
  /** Registra um reenvio (entrar na sala, assinar presença...) chamado a cada `connect`. Devolve o cancelamento. */
  registrarReenvio: (reenviar: () => void) => () => void
  encerrar: () => void
}

export const ESPERA_MIN_MS = 2_000
export const ESPERA_MAX_MS = 30_000
export const DEBOUNCE_LISTAS_MS = 1_000
export const THROTTLE_CONTAGENS_MS = 10_000

/** Espera exponencial limitada entre tentativas de reconexão: 2 s, 4 s, 8 s... até 30 s. */
export function esperaDaTentativa(tentativa: number): number {
  return Math.min(ESPERA_MAX_MS, ESPERA_MIN_MS * 2 ** Math.max(0, tentativa))
}

function codigoDoErro(erro: ErroConexao | undefined): string | null {
  const dados = erro?.data
  if (typeof dados === 'object' && dados !== null && 'codigo' in dados && typeof dados.codigo === 'string') {
    return dados.codigo
  }
  return null
}

/** Socket real: websocket puro, mesmo origin (o proxy do Vite e o servidor cuidam do resto), cookie de sessão. */
export function criarSocketReal(): SocketCliente {
  // `reconnection: false`: a reconexão é própria (backoff de 2 a 30 s e sem tentar de novo no LIMITE_CONEXOES).
  const s: Socket = io({
    path: '/socket.io',
    transports: ['websocket'],
    autoConnect: false,
    withCredentials: true,
    reconnection: false,
  })
  return {
    get conectado() {
      return s.connected
    },
    conectar: () => {
      s.connect()
    },
    desconectar: () => {
      s.disconnect()
    },
    aoEvento: (evento, ouvinte) => {
      const f = (erro?: ErroConexao) => ouvinte(erro)
      s.on(evento, f)
      return () => {
        s.off(evento, f)
      }
    },
    ouvir: (evento, ouvinte) => {
      const nome = String(evento)
      const f = (...args: unknown[]) => {
        Reflect.apply(ouvinte, undefined, args)
      }
      s.on(nome, f)
      return () => {
        s.off(nome, f)
      }
    },
    emitir: (evento, ...args) => {
      s.emit(evento, ...args)
    },
  }
}

let atual: TempoReal | null = null

/** Conexão em uso (ou `null` fora do `_app`). Usada pelos hooks. */
export function tempoRealAtual(): TempoReal | null {
  return atual
}

/**
 * Liga o tempo real (§3.7): conecta, reconecta com backoff, sincroniza o cache e trata o fim da sessão.
 * O cliente nunca confia no evento: ele só invalida o cache e o REST corrige.
 */
export function iniciarTempoReal(deps: DepsTempoReal): TempoReal {
  const { socket, queryClient, irParaLogin } = deps
  const avisar = deps.avisar ?? ((m: string) => void toast(m))

  let estado: EstadoConexao = 'inicial'
  let jaConectou = false
  let tentativas = 0
  let parado = false
  let timerReconexao: number | null = null
  let timerListas: number | null = null
  let timerContagens: number | null = null
  let contagensPendente = false
  const ouvintes = new Set<() => void>()
  const reenvios = new Set<() => void>()
  const cancelar: Array<() => void> = []

  const definirEstado = (novo: EstadoConexao) => {
    if (estado === novo) return
    estado = novo
    for (const o of [...ouvintes]) o()
  }

  const limparTimers = () => {
    for (const id of [timerReconexao, timerListas, timerContagens]) if (id !== null) window.clearTimeout(id)
    timerReconexao = null
    timerListas = null
    timerContagens = null
    contagensPendente = false
  }

  const agendarReconexao = () => {
    if (parado || timerReconexao !== null) return
    const espera = esperaDaTentativa(tentativas)
    tentativas += 1
    timerReconexao = window.setTimeout(() => {
      timerReconexao = null
      if (!parado) socket.conectar()
    }, espera)
  }

  const invalidarListas = () =>
    queryClient.invalidateQueries({ queryKey: chamadoChaves.listas(), refetchType: 'active' })
  const invalidarContagens = () =>
    queryClient.invalidateQueries({ queryKey: chamadoChaves.contagens(), refetchType: 'active' })

  const aoFilaAtualizada = () => {
    // Listas: debounce de 1 s (rajada vira uma invalidação).
    if (timerListas !== null) window.clearTimeout(timerListas)
    timerListas = window.setTimeout(() => {
      timerListas = null
      void invalidarListas()
    }, DEBOUNCE_LISTAS_MS)

    // Contagens: throttle de 10 s (a primeira invalida na hora; o excedente vira uma só ao fim da janela).
    if (timerContagens !== null) {
      contagensPendente = true
      return
    }
    void invalidarContagens()
    const abrirJanela = () => {
      timerContagens = window.setTimeout(() => {
        timerContagens = null
        if (!contagensPendente) return
        contagensPendente = false
        void invalidarContagens()
        abrirJanela()
      }, THROTTLE_CONTAGENS_MS)
    }
    abrirJanela()
  }

  const sessaoEncerrada = () => {
    parado = true
    limparTimers()
    queryClient.clear()
    limparDadosDoUsuario()
    definirEstado('desconectado')
    socket.desconectar()
    irParaLogin()
  }

  cancelar.push(
    socket.aoEvento('connect', () => {
      tentativas = 0
      definirEstado('conectado')
      if (jaConectou) {
        for (const chave of [['notificacoes'], ['chamados'], ['painel']] as const) {
          void queryClient.invalidateQueries({ queryKey: chave })
        }
      }
      jaConectou = true
      for (const reenviar of [...reenvios]) reenviar()
    }),
    socket.aoEvento('disconnect', () => {
      if (parado) return
      definirEstado('desconectado')
      agendarReconexao()
    }),
    socket.aoEvento('connect_error', (erro) => {
      if (parado) return
      const codigo = codigoDoErro(erro)
      if (codigo === 'NAO_AUTENTICADO') {
        parado = true
        limparTimers()
        definirEstado('desconectado')
        irParaLogin()
        return
      }
      definirEstado('desconectado')
      if (codigo === 'LIMITE_CONEXOES') {
        parado = true
        limparTimers()
        avisar('Muitas abas abertas')
        return
      }
      agendarReconexao()
    }),
    socket.ouvir('fila:atualizada', aoFilaAtualizada),
    socket.ouvir('sessao:encerrada', sessaoEncerrada),
  )

  const tempoReal: TempoReal = {
    socket,
    estado: () => estado,
    assinarEstado: (ouvinte) => {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },
    registrarReenvio: (reenviar) => {
      reenvios.add(reenviar)
      return () => {
        reenvios.delete(reenviar)
      }
    },
    encerrar: () => {
      parado = true
      limparTimers()
      for (const c of cancelar) c()
      ouvintes.clear()
      reenvios.clear()
      socket.desconectar()
      if (atual === tempoReal) atual = null
    },
  }
  atual = tempoReal
  socket.conectar()
  return tempoReal
}
