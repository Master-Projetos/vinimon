import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRota } from '@/test/render-rota'

// Radix (Popper) usa ResizeObserver, que o jsdom não tem.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let restaurar: (() => void) | null = null

afterEach(() => {
  cleanup()
  restaurar?.()
  restaurar = null
})

const USUARIO: UsuarioMe = {
  id: 7,
  nome: 'Ana Souza',
  login: 'ana',
  email: null,
  telefone: null,
  perfil: 'ADMIN',
  areaId: null,
  areaIds: [],
  permissoes: [],
  mfaAtivo: true,
  deveTrocarSenha: false,
  tema: 'SISTEMA',
  densidade: null,
  enviarComEnter: true,
}
const SESSAO: SessaoResposta = { estado: 'ATIVA', csrf: 'csrf-teste', usuario: USUARIO }

function notificacao(id: number, lida: boolean) {
  return {
    id,
    tipo: 'COMENTARIO',
    chamado: { id: 100 + id, assunto: `Chamado ${id}` },
    atores: [{ id: 3, nome: 'Bruno Lima' }],
    contagem: 1,
    interno: false,
    trecho: null,
    assentamentoId: null,
    criadoEm: '2026-10-01T10:00:00.000Z',
    atualizadoEm: '2026-10-01T10:00:00.000Z',
    lida,
  }
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
}

describe('/atividade', () => {
  it('renderiza os itens, marca como lida ao clicar e o contador do sino diminui', async () => {
    const lidas = new Set<number>()
    const naoLidas = () => [1, 2].filter((id) => !lidas.has(id)).length
    const r = renderRota('/atividade', {
      sessao: SESSAO,
      respostas: {
        'GET /notificacoes': () =>
          json({ itens: [1, 2].map((id) => notificacao(id, lidas.has(id))), proximoCursor: null }),
        'GET /notificacoes/contagem': () => json({ naoLidas: naoLidas() }),
        'POST /notificacoes/1/lida': () => {
          lidas.add(1)
          return json({ naoLidas: naoLidas() })
        },
      },
    })
    restaurar = r.falsa.restaurar

    expect(await screen.findByText('#101 · Chamado 1')).toBeInTheDocument()
    expect(screen.getByText('#102 · Chamado 2')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Não lida' })).toHaveLength(2)
    expect(await screen.findByRole('button', { name: 'Notificações, 2 não lidas' })).toBeInTheDocument()

    fireEvent.click(screen.getByText('#101 · Chamado 1'))

    await waitFor(() =>
      expect(r.falsa.chamadas.some((c) => c.metodo === 'POST' && c.url === '/api/v1/notificacoes/1/lida')).toBe(true),
    )
    await waitFor(() => expect(screen.getAllByRole('img', { name: 'Não lida' })).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Notificações, 1 não lidas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir chamado' })).toBeInTheDocument()
  })

  it('j e k movem a seleção e o filtro vai para a URL', async () => {
    const r = renderRota('/atividade', {
      sessao: SESSAO,
      respostas: {
        'GET /notificacoes': { itens: [notificacao(1, true), notificacao(2, true)], proximoCursor: null },
        'GET /notificacoes/contagem': { naoLidas: 0 },
      },
    })
    restaurar = r.falsa.restaurar
    await screen.findByText('#101 · Chamado 1')

    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => expect(r.router.state.location.search).toMatchObject({ item: 1 }))
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => expect(r.router.state.location.search).toMatchObject({ item: 2 }))
    fireEvent.keyDown(window, { key: 'k' })
    await waitFor(() => expect(r.router.state.location.search).toMatchObject({ item: 1 }))

    fireEvent.click(screen.getByRole('radio', { name: 'Menções' }))
    await waitFor(() => expect(r.router.state.location.search).toMatchObject({ filtro: 'mencoes' }))
  })

  it.each([403, 404])('%i mostra ErrorState', async (status) => {
    const r = renderRota('/atividade', {
      sessao: SESSAO,
      respostas: {
        'GET /notificacoes': () => json({ erro: { codigo: 'ERRO', mensagem: 'Falhou.' } }, status),
        'GET /notificacoes/contagem': { naoLidas: 0 },
      },
    })
    restaurar = r.falsa.restaurar
    const titulo = status === 403 ? 'Você não tem acesso a este conteúdo' : 'Não encontrado'
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
