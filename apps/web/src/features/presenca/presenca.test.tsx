import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, Outlet } from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { AckAssinar, SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PresenceIndicator } from '@/components/display/presence-indicator'
import { UserHoverCard } from '@/components/display/user-hover-card'
import { authChaves } from '@/features/auth/queries'
import { iniciarTempoReal, type TempoReal } from '@/lib/socket'
import { renderRota } from '@/test/render-rota'
import { SocketFalso } from '@/test/socket-falso'
import { UserMenu } from './components/user-menu'
import { usePresenca } from './hooks'

Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = () => {}

const eu: UsuarioMe = {
  id: 7,
  nome: 'Ana Souza',
  login: 'ana',
  email: null,
  telefone: null,
  perfil: 'OPERADOR',
  areaId: null,
  areaIds: [],
  permissoes: [],
  mfaAtivo: true,
  deveTrocarSenha: false,
  tema: 'SISTEMA',
  densidade: null,
  enviarComEnter: true,
}
const sessao: SessaoResposta = { estado: 'ATIVA', csrf: 'csrf', usuario: eu }

let socket: SocketFalso
let tempoReal: TempoReal

beforeEach(() => {
  socket = new SocketFalso()
  tempoReal = iniciarTempoReal({ socket, queryClient: new QueryClient(), irParaLogin: () => undefined })
})

afterEach(() => {
  cleanup()
  tempoReal.encerrar()
  window.localStorage.clear()
})

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
}

function montarMenu(respostas: Record<string, unknown>) {
  const raiz = createRootRoute({
    component: () => (
      <>
        <UserMenu usuario={{ id: eu.id, nome: eu.nome }} />
        <Outlet />
      </>
    ),
  })
  const perfil = createRoute({ getParentRoute: () => raiz, path: '/perfil', component: () => <p>Página de perfil</p> })
  const login = createRoute({ getParentRoute: () => raiz, path: '/login', component: () => <p>Página de login</p> })
  return renderRota('/', { sessao, respostas, arvore: raiz.addChildren([perfil, login]) })
}

async function abrirMenu() {
  const gatilho = await screen.findByRole('button', { name: /Menu do usuário/ })
  fireEvent.pointerDown(gatilho, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  return gatilho
}

describe('UserMenu', () => {
  it('"Ocupado · 1 h" faz PUT /me/presenca com estado e prazo, e o gatilho passa a mostrar Ocupado', async () => {
    const antes = Date.now()
    const { falsa } = montarMenu({
      'PUT /me/presenca': () =>
        json({ estado: 'OCUPADO', manual: 'OCUPADO', ate: new Date(antes + 3_600_000).toISOString() }),
    })
    const gatilho = await abrirMenu()
    expect(within(gatilho).getByText('Offline')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ocupado · 1 h' }))

    await waitFor(() => expect(falsa.chamadas.some((c) => c.metodo === 'PUT')).toBe(true))
    const chamada = falsa.chamadas.find((c) => c.metodo === 'PUT')
    expect(chamada?.url).toBe('/api/v1/me/presenca')
    const corpo = chamada?.corpo as { estado: string; ate: string }
    expect(corpo.estado).toBe('OCUPADO')
    const ate = new Date(corpo.ate).getTime()
    expect(ate).toBeGreaterThanOrEqual(antes + 3_600_000)
    expect(ate).toBeLessThanOrEqual(Date.now() + 3_600_000)
    await waitFor(() => expect(within(gatilho).getByText('Ocupado')).toBeInTheDocument())
  })

  it('"Ocupado · até eu mudar" manda ate null e "Redefinir" manda estado null', async () => {
    const resposta = () => json({ estado: 'DISPONIVEL', manual: null, ate: null })
    const { falsa } = montarMenu({ 'PUT /me/presenca': resposta })
    await abrirMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ocupado · até eu mudar' }))
    await waitFor(() => expect(falsa.chamadas).toHaveLength(1))
    expect(falsa.chamadas[0]?.corpo).toEqual({ estado: 'OCUPADO', ate: null })

    await abrirMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Redefinir' }))
    await waitFor(() => expect(falsa.chamadas).toHaveLength(2))
    expect(falsa.chamadas[1]?.corpo).toEqual({ estado: null, ate: null })
  })

  it('presenca:propria do servidor atualiza o gatilho', async () => {
    montarMenu({})
    const gatilho = await abrirMenu()
    act(() => socket.disparar('presenca:propria', { estado: 'AUSENTE', manual: null, ate: null }))
    await waitFor(() => expect(within(gatilho).getByText('Ausente')).toBeInTheDocument())
  })

  it('trocar o tema chama PATCH /me e grava vinimon:tema', async () => {
    const { falsa } = montarMenu({ 'PATCH /me': () => json({ ...eu, tema: 'ESCURO' }) })
    await abrirMenu()
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Escuro' }))
    await waitFor(() => expect(falsa.chamadas.some((c) => c.metodo === 'PATCH')).toBe(true))
    expect(falsa.chamadas.find((c) => c.metodo === 'PATCH')?.corpo).toEqual({ tema: 'ESCURO' })
    expect(window.localStorage.getItem('vinimon:tema')).toBe('"escuro"')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('trocar a densidade chama PATCH /me e grava vinimon:densidade', async () => {
    const { falsa } = montarMenu({ 'PATCH /me': () => json({ ...eu, densidade: 'COMPACTA' }) })
    await abrirMenu()
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Compacta' }))
    await waitFor(() => expect(falsa.chamadas.some((c) => c.metodo === 'PATCH')).toBe(true))
    expect(falsa.chamadas.find((c) => c.metodo === 'PATCH')?.corpo).toEqual({ densidade: 'COMPACTA' })
    expect(window.localStorage.getItem('vinimon:densidade')).toBe('"compacta"')
  })

  it('Atalhos abre a lista de atalhos', async () => {
    montarMenu({})
    await abrirMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Atalhos de teclado' }))
    expect(await screen.findByRole('dialog', { name: 'Atalhos de teclado' })).toBeInTheDocument()
  })

  it('Sair chama POST /auth/logout, encerra o tempo real, limpa dados do usuário e vai ao login', async () => {
    window.localStorage.setItem('vinimon:u7:recentes', '[1]')
    const { falsa, queryClient } = montarMenu({ 'POST /auth/logout': () => new Response(null, { status: 204 }) })
    await abrirMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }))
    expect(await screen.findByText('Página de login')).toBeInTheDocument()
    expect(falsa.chamadas.some((c) => c.metodo === 'POST' && c.url === '/api/v1/auth/logout')).toBe(true)
    expect(socket.desconexoes).toBe(1)
    expect(window.localStorage.getItem('vinimon:u7:recentes')).toBeNull()
    await waitFor(() => expect(queryClient.getQueryData(authChaves.sessao)).toBeUndefined())
  })
})

function Probe({ ids }: { ids: number[] }) {
  const mapa = usePresenca(ids)
  return (
    <ul>
      {ids.map((id) => (
        <li key={id} data-testid={`u${id}`}>
          <PresenceIndicator status={mapa[id] ?? 'OFFLINE'} />
        </li>
      ))}
    </ul>
  )
}

function comProvider(ui: React.ReactNode) {
  const queryClient = new QueryClient()
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function assinaturas() {
  return socket.emitidos.filter((e) => e.evento === 'presenca:assinar')
}

describe('usePresenca', () => {
  it('assina com ack, aplica presenca:mudou no sr-only e reassina no connect', async () => {
    comProvider(<Probe ids={[5, 6]} />)
    expect(assinaturas()).toHaveLength(0) // ainda não conectou
    act(() => socket.conectou())
    expect(assinaturas()).toHaveLength(1)
    const [payload, ack] = assinaturas()[0]?.args ?? []
    expect(payload).toEqual({ usuarioIds: [5, 6] })
    const resposta: AckAssinar = {
      ok: true,
      presencas: [
        { usuarioId: 5, estado: 'DISPONIVEL' },
        { usuarioId: 6, estado: 'AUSENTE' },
      ],
    }
    act(() => {
      if (typeof ack === 'function') ack(resposta)
    })
    await waitFor(() => expect(within(screen.getByTestId('u5')).getByText('Disponível')).toBeInTheDocument())
    expect(within(screen.getByTestId('u6')).getByText('Ausente')).toBeInTheDocument()

    act(() => socket.disparar('presenca:mudou', { usuarioId: 5, estado: 'OCUPADO' }))
    await waitFor(() => expect(within(screen.getByTestId('u5')).getByText('Ocupado')).toBeInTheDocument())
    expect(within(screen.getByTestId('u6')).getByText('Ausente')).toBeInTheDocument()

    act(() => socket.caiu())
    act(() => socket.conectou())
    expect(assinaturas()).toHaveLength(2)
  })

  it('ignora presenca:mudou de quem não foi pedido e não deixa ouvintes ao desmontar', () => {
    const { unmount } = comProvider(<Probe ids={[5]} />)
    act(() => socket.conectou())
    const antes = socket.ouvintesAtivos
    act(() => socket.disparar('presenca:mudou', { usuarioId: 99, estado: 'OCUPADO' }))
    expect(screen.getByTestId('u5')).toHaveTextContent('Offline')
    unmount()
    expect(socket.ouvintesAtivos).toBeLessThan(antes)
    act(() => socket.caiu())
    act(() => socket.conectou())
    expect(assinaturas()).toHaveLength(1) // sem reenvio depois de desmontar
  })
})

describe('UserHoverCard', () => {
  it('ao focar mostra nome, área e presença, sem outros dados', async () => {
    act(() => socket.conectou())
    comProvider(
      <UserHoverCard usuario={{ id: 5, nome: 'Bruno Lima' }} area="Suporte">
        <span>Bruno Lima</span>
      </UserHoverCard>,
    )
    fireEvent.focus(screen.getByRole('button', { name: 'Bruno Lima' }))
    const cartao = await screen.findByLabelText('Perfil de Bruno Lima')
    expect(within(cartao).getByText('Suporte')).toBeInTheDocument()
    expect(within(cartao).getByText('Offline')).toBeInTheDocument()
    await waitFor(() => expect(assinaturas()).toHaveLength(1))
    expect(assinaturas()[0]?.args[0]).toEqual({ usuarioIds: [5] })
  })
})
