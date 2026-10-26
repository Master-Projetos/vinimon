import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRota } from '@/test/render-rota'

// Radix (Dialog, Popper) usa ResizeObserver, que o jsdom não tem.
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

function sessao(): SessaoResposta {
  const usuario: UsuarioMe = {
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
  return { estado: 'ATIVA', csrf: 'csrf-teste', usuario }
}

const ATUAL = '11111111-1111-4111-8111-111111111111'
const OUTRA = '22222222-2222-4222-8222-222222222222'
const TERCEIRA = '33333333-3333-4333-8333-333333333333'
const sessaoDispositivo = (id: string, userAgent: string, atual = false) => ({
  id,
  criadaEm: '2026-10-01T10:00:00.000Z',
  ultimoUsoEm: '2026-10-02T10:00:00.000Z',
  ip: '10.0.0.5',
  userAgent,
  atual,
})
const LISTA = [
  sessaoDispositivo(ATUAL, 'Firefox no Linux', true),
  sessaoDispositivo(OUTRA, 'Chrome no Windows'),
  sessaoDispositivo(TERCEIRA, 'Safari no iPhone'),
]
const semCorpo = () => new Response(null, { status: 204 })

function montar(respostas: Record<string, unknown>) {
  const r = renderRota('/perfil/sessoes', { sessao: sessao(), respostas })
  restaurar = r.falsa.restaurar
  return r
}

const apagados = (falsa: { chamadas: { metodo: string; url: string }[] }) =>
  falsa.chamadas.filter((c) => c.metodo === 'DELETE').map((c) => c.url)

describe('/perfil/sessoes', () => {
  it('lista as sessões com o selo "Esta sessão" só na atual', async () => {
    montar({ 'GET /auth/sessoes': LISTA })
    expect(await screen.findByText('Firefox no Linux')).toBeInTheDocument()
    expect(screen.getAllByText('Esta sessão')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Encerrar sessão de Firefox/ })).not.toBeInTheDocument()
  })

  it('"Encerrar" chama DELETE com o id da linha', async () => {
    const { falsa } = montar({ 'GET /auth/sessoes': LISTA, [`DELETE /auth/sessoes/${OUTRA}`]: semCorpo })
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar sessão de Chrome no Windows' }))
    await waitFor(() => expect(apagados(falsa)).toEqual([`/api/v1/auth/sessoes/${OUTRA}`]))
  })

  it('"Encerrar as outras" revoga todas menos a atual', async () => {
    const { falsa } = montar({
      'GET /auth/sessoes': LISTA,
      [`DELETE /auth/sessoes/${OUTRA}`]: semCorpo,
      [`DELETE /auth/sessoes/${TERCEIRA}`]: semCorpo,
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar as outras' }))
    await waitFor(() => expect(apagados(falsa)).toHaveLength(2))
    expect(apagados(falsa)).toEqual([`/api/v1/auth/sessoes/${OUTRA}`, `/api/v1/auth/sessoes/${TERCEIRA}`])
  })

  it('403 mostra ErrorState', async () => {
    montar({
      'GET /auth/sessoes': () =>
        new Response(JSON.stringify({ erro: { codigo: 'SEM_PERMISSAO', mensagem: 'Negado.' } }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    })
    expect(await screen.findByText('Você não tem acesso a este conteúdo')).toBeInTheDocument()
  })
})
