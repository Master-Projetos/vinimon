import { type InfiniteData, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { iniciarTempoReal, type TempoReal } from '@/lib/socket'
import { type ApiFalsa, apiFalsa } from '@/test/api-falsa'
import { SocketFalso } from '@/test/socket-falso'
import type { PaginaConversa } from './cache'
import { ReadReceipt } from './components/read-receipt'
import { TypingIndicator } from './components/typing-indicator'
import { EXPIRA_DIGITANDO_MS, useDigitando, useLeituras, useSalaDoChamado } from './hooks'
import { conversaChaves } from './queries'

let socket: SocketFalso
let tempoReal: TempoReal
let queryClient: QueryClient
let falsa: ApiFalsa | undefined

function envolver({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

beforeEach(() => {
  socket = new SocketFalso()
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  tempoReal = iniciarTempoReal({ socket, queryClient, irParaLogin: () => undefined, avisar: () => undefined })
})

afterEach(() => {
  cleanup()
  tempoReal.encerrar()
  falsa?.restaurar()
  falsa = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const digitandoRecebido = (digitando: boolean) => ({
  chamadoId: 1,
  usuario: { id: 2, nome: 'Bia Lima' },
  interno: false,
  digitando,
})
const emitidos = () => socket.emitidos.filter((e) => e.evento === 'chamado:digitando').map((e) => e.args[0])

describe('useDigitando', () => {
  beforeEach(() => vi.useFakeTimers())

  it('avisa no máximo a cada 3 s, para sozinho após 5 s e no blur/envio', () => {
    const { result } = renderHook(() => useDigitando(1, 7), { wrapper: envolver })
    act(() => result.current.aoDigitar(false))
    act(() => vi.advanceTimersByTime(1_000))
    act(() => result.current.aoDigitar(false))
    expect(emitidos()).toEqual([{ chamadoId: 1, interno: false, digitando: true }])
    act(() => vi.advanceTimersByTime(2_000))
    act(() => result.current.aoDigitar(false))
    expect(emitidos()).toHaveLength(2)
    act(() => vi.advanceTimersByTime(5_000))
    expect(emitidos().at(-1)).toEqual({ chamadoId: 1, interno: false, digitando: false })
    expect(emitidos()).toHaveLength(3)
    act(() => result.current.aoDigitar(true))
    act(() => result.current.aoParar())
    expect(emitidos().at(-1)).toEqual({ chamadoId: 1, interno: true, digitando: false })
  })

  it('a recepção expira em 6 s e o texto fica em aria-live', () => {
    const { result } = renderHook(() => useDigitando(1, 7), { wrapper: envolver })
    render(<TypingIndicator nomes={['Bia Lima']} />)
    expect(screen.getByText('Bia Lima está digitando…').closest('p')).toHaveAttribute('aria-live', 'polite')
    act(() => socket.disparar('chamado:digitando', digitandoRecebido(true)))
    expect(result.current.nomes).toEqual(['Bia Lima'])
    act(() => vi.advanceTimersByTime(EXPIRA_DIGITANDO_MS - 1))
    expect(result.current.nomes).toEqual(['Bia Lima'])
    act(() => vi.advanceTimersByTime(2))
    expect(result.current.nomes).toEqual([])
  })

  it('ignora o próprio usuário, outro chamado e o "parou"', () => {
    const { result } = renderHook(() => useDigitando(1, 7), { wrapper: envolver })
    act(() => socket.disparar('chamado:digitando', { ...digitandoRecebido(true), usuario: { id: 7, nome: 'Eu' } }))
    act(() => socket.disparar('chamado:digitando', { ...digitandoRecebido(true), chamadoId: 9 }))
    expect(result.current.nomes).toEqual([])
    act(() => socket.disparar('chamado:digitando', digitandoRecebido(true)))
    act(() => socket.disparar('chamado:digitando', digitandoRecebido(false)))
    expect(result.current.nomes).toEqual([])
  })
})

describe('useLeituras', () => {
  const leitura = (ultimo: number) => [
    { usuario: { id: 2, nome: 'Bia Lima' }, ultimoAssentamentoId: ultimo, lidoEm: new Date().toISOString() },
    { usuario: { id: 7, nome: 'Ana Souza' }, ultimoAssentamentoId: ultimo, lidoEm: new Date().toISOString() },
  ]

  function Painel({ ultimoId }: { ultimoId: number | null }) {
    const { leituras, refSentinela } = useLeituras(1, ultimoId)
    return (
      <div>
        <ReadReceipt leituras={leituras} usuarioId={7} ultimoId={ultimoId} />
        <div ref={refSentinela} />
      </div>
    )
  }

  it('mostra "Visto por" com a lista inicial e atualiza com chamado:leitura', async () => {
    falsa = apiFalsa({
      'GET /chamados/1/leituras': [
        { usuario: { id: 2, nome: 'Bia Lima' }, ultimoAssentamentoId: 5, lidoEm: new Date().toISOString() },
      ],
      'POST /chamados/1/leitura': { ultimoAssentamentoLidoId: 10 },
    })
    render(<Painel ultimoId={10} />, { wrapper: envolver })
    await waitFor(() => expect(falsa?.chamadas.some((c) => c.url === '/api/v1/chamados/1/leituras')).toBe(true))
    expect(screen.queryByText(/Visto por/)).not.toBeInTheDocument()
    act(() =>
      socket.disparar('chamado:leitura', {
        chamadoId: 1,
        usuarioId: 2,
        ultimoAssentamentoId: 10,
        lidoEm: new Date().toISOString(),
      }),
    )
    expect(await screen.findByText('Visto por Bia')).toBeInTheDocument()
  })

  it('resume vários leitores em "Visto por Ana, João +2"', () => {
    const lista = ['Ana Dias', 'João Reis', 'Caio Melo', 'Dora Lins'].map((nome, i) => ({
      usuario: { id: 20 + i, nome },
      ultimoAssentamentoId: 10,
      lidoEm: new Date(),
    }))
    render(<ReadReceipt leituras={lista} usuarioId={7} ultimoId={10} />)
    expect(screen.getByText('Visto por Ana, João +2')).toBeInTheDocument()
    expect(leitura(1)).toHaveLength(2)
  })

  it('envia POST leitura com debounce de 1 s quando o fim está visível e a janela tem foco', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    falsa = apiFalsa({ 'GET /chamados/1/leituras': [], 'POST /chamados/1/leitura': { ultimoAssentamentoLidoId: 10 } })
    render(<Painel ultimoId={10} />, { wrapper: envolver })
    expect(falsa.chamadas.some((c) => c.metodo === 'POST')).toBe(false)
    await waitFor(
      () => expect(falsa?.chamadas.find((c) => c.metodo === 'POST')?.corpo).toEqual({ assentamentoId: 10 }),
      {
        timeout: 3_000,
      },
    )
  })

  it('sem foco na janela não marca como lido', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    falsa = apiFalsa({ 'GET /chamados/1/leituras': [], 'POST /chamados/1/leitura': { ultimoAssentamentoLidoId: 10 } })
    render(<Painel ultimoId={10} />, { wrapper: envolver })
    await new Promise((r) => setTimeout(r, 1_300))
    expect(falsa.chamadas.some((c) => c.metodo === 'POST')).toBe(false)
  })
})

describe('useSalaDoChamado', () => {
  function Sala() {
    useSalaDoChamado(1)
    return null
  }
  function montar() {
    const router = createRouter({
      routeTree: createRootRoute({ component: Sala }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  it('entra na sala a cada connect e mescla assentamento:novo no cache', async () => {
    queryClient.setQueryData<InfiniteData<PaginaConversa, number | undefined>>(conversaChaves.lista(1), {
      pages: [{ itens: [], proximoCursor: null }],
      pageParams: [undefined],
    })
    montar()
    await waitFor(() => expect(socket.ouvintesAtivos).toBeGreaterThan(0))
    act(() => socket.conectou())
    act(() => socket.caiu())
    act(() => socket.conectou())
    expect(socket.emitidos.filter((e) => e.evento === 'chamado:entrar')).toHaveLength(2)

    act(() =>
      socket.disparar('assentamento:novo', {
        chamadoId: 1,
        assentamento: {
          id: 30,
          chamadoId: 1,
          tipo: 'COMENTARIO',
          interno: false,
          texto: 'Olá da outra aba',
          evento: null,
          dados: null,
          autor: { id: 2, nome: 'Bia Lima' },
          criadoEm: new Date().toISOString(),
          clienteId: null,
        },
      }),
    )
    const dados = queryClient.getQueryData<InfiniteData<PaginaConversa>>(conversaChaves.lista(1))
    expect(dados?.pages[0]?.itens.map((i) => i.texto)).toEqual(['Olá da outra aba'])
  })

  it('acessoRevogado mostra o aviso e leva à lista', async () => {
    montar()
    await waitFor(() => expect(socket.ouvintesAtivos).toBeGreaterThan(0))
    const aviso = vi.fn()
    const { toast } = await import('sonner')
    vi.spyOn(toast, 'error').mockImplementation((m) => {
      aviso(m)
      return 1
    })
    act(() => socket.disparar('chamado:acessoRevogado', { chamadoId: 1 }))
    expect(aviso).toHaveBeenCalledWith('Você não tem mais acesso a este chamado')
  })
})
