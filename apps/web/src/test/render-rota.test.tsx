import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { CONFIG_PADRAO, type Meta, type SessaoResposta } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApiFalsa } from './api-falsa'
import { renderRota } from './render-rota'

// Radix (Popper) usa ResizeObserver, que o jsdom não tem.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/* Exercita renderRota + apiFalsa contra a rota real /admin/areas (T-10.5). */
const sessao: SessaoResposta = {
  estado: 'ATIVA',
  csrf: 'csrf-teste',
  usuario: {
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
  },
}

const area = (id: number, nome: string) => ({
  id,
  nome,
  atende: true,
  ativo: true,
  jornadaId: null,
  criadoEm: '2026-10-01T10:00:00.000Z',
  atualizadoEm: '2026-10-01T10:00:00.000Z',
})

const meta: Meta = {
  areas: [],
  prioridades: [],
  status: [],
  problemas: [],
  canais: [],
  departamentos: [],
  unidades: [],
  tiposAtivo: [],
  jornadas: [],
  categorias: [],
  config: Object.fromEntries(Object.entries(CONFIG_PADRAO)) as Meta['config'],
}

let falsaAtual: ApiFalsa | undefined

afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(respostas: Parameters<typeof renderRota>[1]['respostas']) {
  const resultado = renderRota('/admin/areas', { sessao, respostas })
  falsaAtual = resultado.falsa
  return resultado
}

describe('renderRota + apiFalsa (rota real /admin/areas)', () => {
  it('renderiza as áreas com os dados e envia o POST com o body esperado', async () => {
    const { falsa } = montar({
      'GET /areas': { itens: [area(1, 'Financeiro'), area(2, 'Suporte')], total: 2, pagina: 1, porPagina: 20 },
      'GET /meta': meta,
      'POST /areas': () =>
        new Response(JSON.stringify(area(3, 'Jurídico')), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    })

    expect(await screen.findByText('Financeiro')).toBeInTheDocument()
    expect(screen.getByText('Suporte')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Nova área/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Jurídico' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/areas',
        corpo: { nome: 'Jurídico', atende: true, ativo: true, jornadaId: null, moduloInventario: true, destinos: [] },
      }),
    )
    expect(falsa.chamadas.filter((c) => c.metodo === 'POST')).toHaveLength(1)
  })
})
