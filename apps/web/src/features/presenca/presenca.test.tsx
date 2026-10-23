import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PresenceIndicator } from '@/components/display/presence-indicator'
import { DensityProvider } from '@/components/theme/density-provider'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { authChaves } from '@/features/auth/queries'
import { iniciarTempoReal, type TempoReal } from '@/lib/socket'
import { type ApiFalsa, apiFalsa } from '@/test/api-falsa'
import { SocketFalso } from '@/test/socket-falso'
import { UserMenu } from './components/user-menu'
import { usePresenca } from './hooks'

// Radix (Popper, DropdownMenu) usa APIs que o jsdom não tem.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = () => {}

const ANA = { id: 7, nome: 'Ana Souza' }
const PROPRIA = { estado: 'OCUPADO', manual: 'OCUPADO', ate: null }

let socket: SocketFalso
let tempoReal: TempoReal
let falsa: ApiFalsa

function Presenca({ id }: { id: number }) {
  const presencas = usePresenca([id])
  return <PresenceIndicator status={presencas[id] ?? 'OFFLINE'} />
}

function montar(corpo: () => React.ReactNode, respostas: Record<string, unknown> = {}) {
  falsa = apiFalsa({
    'PUT /me/presenca': PROPRIA,
    'PATCH /me': { ...ANA, login: 'ana', perfil: 'ADMIN' },
    ...respostas,
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(authChaves.sessao, { estado: 'ATIVA', csrf: 'x', usuario: null })
  tempoReal = iniciarTempoReal({ socket, queryClient, irParaLogin: () => undefined, avisar: () => undefined })
  const router = createRouter({
    routeTree: createRootRoute({ component: corpo }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <ThemeProvider>
      <DensityProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </DensityProvider>
    </ThemeProvider>,
  )
}

const abrirMenu = async () =>
  fireEvent.pointerDown(await screen.findByRole('button', { name: `Menu de ${ANA.nome}` }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })

beforeEach(() => {
  socket = new SocketFalso()
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  tempoReal?.encerrar()
  falsa?.restaurar()
})

describe('usePresenca', () => {
  it('assina ao conectar, aplica o ack e atualiza com presenca:mudou', async () => {
    montar(() => <Presenca id={9} />)
    expect(await screen.findByText('Offline')).toBeInTheDocument()

    act(() => socket.conectou())
    const assinatura = socket.emitidos.find((e) => e.evento === 'presenca:assinar')
    expect(assinatura?.args[0]).toEqual({ usuarioIds: [9] })
    const ack = assinatura?.args[1] as (r: unknown) => void
    act(() => ack({ ok: true, presencas: [{ usuarioId: 9, estado: 'DISPONIVEL' }] }))
    expect(await screen.findByText('Disponível')).toBeInTheDocument()

    act(() => socket.disparar('presenca:mudou', { usuarioId: 9, estado: 'OCUPADO' }))
    expect(await screen.findByText('Ocupado')).toBeInTheDocument()
  })

  it('reassina a cada nova conexão', async () => {
    montar(() => <Presenca id={9} />)
    await screen.findByText('Offline')
    act(() => socket.conectou())
    act(() => socket.caiu())
    act(() => socket.conectou())
    await waitFor(() => expect(socket.emitidos.filter((e) => e.evento === 'presenca:assinar')).toHaveLength(2))
  })
})

describe('menu do usuário', () => {
  it('"Ocupado · 1 h" faz PUT /me/presenca com estado e prazo', async () => {
    montar(() => <UserMenu usuario={ANA} />)
    await abrirMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ocupado · 1 h' }))
    await waitFor(() => expect(falsa.chamadas.some((c) => c.metodo === 'PUT')).toBe(true))
    const chamada = falsa.chamadas.find((c) => c.metodo === 'PUT')
    expect(chamada?.url).toBe('/api/v1/me/presenca')
    const corpo = chamada?.corpo as { estado: string; ate: string }
    expect(corpo.estado).toBe('OCUPADO')
    const diferenca = new Date(corpo.ate).getTime() - Date.now()
    expect(diferenca).toBeGreaterThan(3_500_000)
    expect(diferenca).toBeLessThanOrEqual(3_600_000)
  })

  it('"Redefinir status" manda estado e prazo nulos', async () => {
    montar(() => <UserMenu usuario={ANA} />)
    await abrirMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Redefinir status' }))
    await waitFor(() => expect(falsa.chamadas.some((c) => c.metodo === 'PUT')).toBe(true))
    expect(falsa.chamadas.find((c) => c.metodo === 'PUT')?.corpo).toEqual({ estado: null, ate: null })
  })

  it('trocar o tema chama PATCH /me e grava vinimon:tema', async () => {
    montar(() => <UserMenu usuario={ANA} />)
    await abrirMenu()
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Escuro' }))
    await waitFor(() => expect(falsa.chamadas.some((c) => c.metodo === 'PATCH')).toBe(true))
    expect(falsa.chamadas.find((c) => c.metodo === 'PATCH')?.corpo).toEqual({ tema: 'ESCURO' })
    expect(window.localStorage.getItem('vinimon:tema')).toBe('"escuro"')
  })

  it('Sair chama POST /auth/logout e apaga os dados do usuário', async () => {
    window.localStorage.setItem('vinimon:u7:recentes', '[1]')
    montar(() => <UserMenu usuario={ANA} />, { 'POST /auth/logout': () => new Response(null, { status: 204 }) })
    await abrirMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }))
    await waitFor(() => expect(falsa.chamadas.some((c) => c.url === '/api/v1/auth/logout')).toBe(true))
    await waitFor(() => expect(window.localStorage.getItem('vinimon:u7:recentes')).toBeNull())
    expect(socket.desconexoes).toBeGreaterThan(0)
  })
})
