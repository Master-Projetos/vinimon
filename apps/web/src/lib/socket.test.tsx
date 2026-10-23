import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineIndicator } from '@/components/layout/offline-indicator'
import { usePresencaAtividade } from '@/features/presenca/hooks'
import { useSocketEvento } from '@/hooks/use-socket-evento'
import { gravar, ler } from '@/lib/storage'
import { SocketFalso } from '@/test/socket-falso'
import { esperaDaTentativa, iniciarTempoReal, type TempoReal } from './socket'

let socket: SocketFalso
let queryClient: QueryClient
let irParaLogin: ReturnType<typeof vi.fn<() => void>>
let avisar: ReturnType<typeof vi.fn<(m: string) => void>>
let tempoReal: TempoReal
let invalidar: ReturnType<typeof vi.spyOn>

function iniciar() {
  tempoReal = iniciarTempoReal({ socket, queryClient, irParaLogin, avisar })
}

function chavesInvalidadas(): unknown[] {
  return invalidar.mock.calls.map((c: unknown[]) => (c[0] as { queryKey: unknown }).queryKey)
}

beforeEach(() => {
  vi.useFakeTimers()
  socket = new SocketFalso()
  queryClient = new QueryClient()
  irParaLogin = vi.fn<() => void>()
  avisar = vi.fn<(m: string) => void>()
  invalidar = vi.spyOn(queryClient, 'invalidateQueries')
})

afterEach(() => {
  tempoReal?.encerrar()
  window.localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('tempo real: conexão', () => {
  it('conecta ao iniciar e desconecta ao encerrar, sem ouvintes sobrando', () => {
    iniciar()
    expect(socket.conexoes).toBe(1)
    tempoReal.encerrar()
    expect(socket.desconexoes).toBe(1)
    expect(socket.ouvintesAtivos).toBe(0)
  })

  it('disconnect mostra "Reconectando…" e o connect esconde e invalida notificações, chamados e painel', () => {
    iniciar()
    render(<OfflineIndicator />)
    socket.conectou()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(invalidar).not.toHaveBeenCalled() // a primeira conexão não invalida nada

    act(() => socket.caiu())
    expect(screen.getByRole('status')).toHaveTextContent('Reconectando…')

    act(() => vi.advanceTimersByTime(2_000))
    expect(socket.conexoes).toBe(2)
    act(() => socket.conectou())
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(chavesInvalidadas()).toEqual([['notificacoes'], ['chamados'], ['painel']])
  })

  it('NAO_AUTENTICADO leva ao /login sem nova tentativa', () => {
    iniciar()
    socket.erroDeConexao('NAO_AUTENTICADO')
    expect(irParaLogin).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(120_000)
    expect(socket.conexoes).toBe(1)
  })

  it('LIMITE_CONEXOES avisa "Muitas abas abertas" e não tenta de novo', () => {
    iniciar()
    socket.erroDeConexao('LIMITE_CONEXOES')
    expect(avisar).toHaveBeenCalledWith('Muitas abas abertas')
    vi.advanceTimersByTime(120_000)
    expect(socket.conexoes).toBe(1)
    expect(irParaLogin).not.toHaveBeenCalled()
  })

  it('outros erros reconectam com espera exponencial de 2 a 30 s, que volta a 2 s depois do connect', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(esperaDaTentativa)).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000])
    iniciar()
    socket.erroDeConexao('ERRO_INTERNO')
    vi.advanceTimersByTime(1_999)
    expect(socket.conexoes).toBe(1)
    vi.advanceTimersByTime(1)
    expect(socket.conexoes).toBe(2)

    socket.erroDeConexao() // sem código
    vi.advanceTimersByTime(3_999)
    expect(socket.conexoes).toBe(2)
    vi.advanceTimersByTime(1)
    expect(socket.conexoes).toBe(3)

    socket.conectou()
    socket.caiu()
    vi.advanceTimersByTime(2_000)
    expect(socket.conexoes).toBe(4)
  })
})

describe('tempo real: fila:atualizada', () => {
  it('5 eventos em 1 s geram 1 invalidação de listas e 1 de contagens na janela de 10 s', () => {
    iniciar()
    for (let i = 0; i < 5; i++) {
      socket.disparar('fila:atualizada', { chamadoId: i + 1, motivo: 'criado' })
      vi.advanceTimersByTime(200)
    }
    vi.advanceTimersByTime(1_000)
    const listas = chavesInvalidadas().filter((k) => (k as string[])[1] === 'lista')
    const contagens = chavesInvalidadas().filter((k) => (k as string[])[1] === 'contagens')
    expect(listas).toHaveLength(1)
    expect(contagens).toHaveLength(1)
    expect(
      invalidar.mock.calls.every((c: unknown[]) => (c[0] as { refetchType: string }).refetchType === 'active'),
    ).toBe(true)

    vi.advanceTimersByTime(7_000) // 9 s desde a primeira: ainda dentro da janela
    expect(chavesInvalidadas().filter((k) => (k as string[])[1] === 'contagens')).toHaveLength(1)
    vi.advanceTimersByTime(1_000) // fim da janela: o excedente vira uma só
    expect(chavesInvalidadas().filter((k) => (k as string[])[1] === 'contagens')).toHaveLength(2)
  })
})

describe('tempo real: sessao:encerrada', () => {
  it('limpa o cache e as chaves vinimon:u*, preserva o tema e vai ao /login sem reconectar', () => {
    gravar('u7:recentes', [1])
    gravar('u7:rascunho:novo-chamado', {})
    gravar('tema', 'escuro')
    queryClient.setQueryData(['chamados', 'lista'], { itens: [] })
    iniciar()
    socket.conectou()

    socket.disparar('sessao:encerrada', { motivo: 'revogada' })
    socket.caiu() // o servidor derruba logo depois
    vi.advanceTimersByTime(120_000)

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(ler('u7:recentes', null)).toBeNull()
    expect(ler('u7:rascunho:novo-chamado', null)).toBeNull()
    expect(ler('tema', null)).toBe('escuro')
    expect(irParaLogin).toHaveBeenCalledTimes(1)
    expect(socket.conexoes).toBe(1)
  })
})

describe('useSocketEvento', () => {
  const embrulho = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  it('entrega o evento, volta a entrar na sala ao reconectar e sai dela ao desmontar', () => {
    iniciar()
    socket.conectou()
    const handler = vi.fn()
    const { unmount } = renderHook(() => useSocketEvento('chamado:atualizado', handler, { chamadoId: 9 }), {
      wrapper: embrulho,
    })
    expect(socket.emitidos.map((e) => e.evento)).toEqual(['chamado:entrar'])

    socket.disparar('chamado:atualizado', { chamadoId: 9, campos: ['status'] })
    expect(handler).toHaveBeenCalledWith({ chamadoId: 9, campos: ['status'] })

    socket.caiu()
    vi.advanceTimersByTime(2_000)
    socket.conectou()
    expect(socket.emitidos.map((e) => e.evento)).toEqual(['chamado:entrar', 'chamado:entrar'])

    unmount()
    expect(socket.emitidos.at(-1)).toEqual({ evento: 'chamado:sair', args: [{ chamadoId: 9 }] })
    socket.disparar('chamado:atualizado', { chamadoId: 9, campos: [] })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('usePresencaAtividade', () => {
  it('avisa só quando o valor muda (ocioso depois de 5 min, ativo na primeira entrada)', () => {
    iniciar()
    socket.conectou()
    renderHook(() => usePresencaAtividade())
    expect(socket.emitidos).toEqual([])

    act(() => {
      window.dispatchEvent(new Event('pointermove'))
      vi.advanceTimersByTime(4 * 60_000)
      window.dispatchEvent(new Event('keydown')) // reinicia a contagem
      vi.advanceTimersByTime(4 * 60_000)
    })
    expect(socket.emitidos).toEqual([])

    act(() => vi.advanceTimersByTime(60_000))
    expect(socket.emitidos).toEqual([{ evento: 'presenca:atividade', args: [{ ativo: false }] }])

    act(() => {
      window.dispatchEvent(new Event('pointermove'))
      window.dispatchEvent(new Event('pointermove'))
    })
    expect(socket.emitidos).toEqual([
      { evento: 'presenca:atividade', args: [{ ativo: false }] },
      { evento: 'presenca:atividade', args: [{ ativo: true }] },
    ])
  })
})
