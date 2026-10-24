import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { Painel, SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRota } from '@/test/render-rota'

// Radix (Select) e recharts usam ResizeObserver, que o jsdom não tem.
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

function sessao(perfil: UsuarioMe['perfil']): SessaoResposta {
  const usuario: UsuarioMe = {
    id: 7,
    nome: 'Ana Souza',
    login: 'ana',
    email: null,
    telefone: null,
    perfil,
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

const painel = (reduzido: boolean): Painel => ({
  reduzido,
  periodo: 30,
  kpis: {
    abertos: 12,
    filaSemResponsavel: 3,
    minhaFila: 4,
    abertosHoje: 2,
    concluidosHoje: 1,
    slaVencido: 5,
    slaEmRisco: 6,
    aguardandoValidacao: 7,
  },
  abertosEncerradosPorMes: [{ mes: '2026-10', abertos: 9, encerrados: 8 }],
  porStatus: [{ id: 1, nome: 'Novo', total: 4 }],
  porPrioridade: [{ id: 1, nome: 'Alta', total: 2 }],
  porArea: [{ id: 1, nome: 'Suporte', total: 6 }],
  avaliacoesDoMes: [{ nota: 'OTIMO', total: 3 }],
  slaProximo: [
    {
      id: 42,
      assunto: 'Impressora parada',
      status: 'Novo',
      area: 'Suporte',
      prazoSolucaoEm: new Date('2026-10-25T12:00:00.000Z'),
    },
  ],
})

function montar(perfil: UsuarioMe['perfil'], reduzido: boolean, caminho = '/painel') {
  const r = renderRota(caminho, {
    sessao: sessao(perfil),
    respostas: { 'GET /painel': painel(reduzido), 'GET /meta': { areas: [] } },
  })
  restaurar = r.falsa.restaurar
  return r
}

describe('/painel', () => {
  it('StatCard leva a /chamados com a visão correspondente', async () => {
    const r = montar('OPERADOR', false)
    const link = await screen.findByRole('link', { name: /Minha fila/ })
    fireEvent.click(link)
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/chamados'))
    expect(r.router.state.location.search).toMatchObject({ visao: 'minha-fila' })
  })

  it('"Ver como tabela" troca o gráfico pelos mesmos dados em <table>', async () => {
    montar('ADMIN', false)
    const [botao] = await screen.findAllByRole('button', { name: 'Ver como tabela' })
    if (!botao) throw new Error('botão ausente')
    fireEvent.click(botao)
    const tabela = await screen.findByRole('table', { name: 'Abertos × encerrados' })
    expect(tabela).toHaveTextContent('2026-10')
    expect(screen.getByRole('button', { name: 'Ver como gráfico' })).toBeInTheDocument()
  })

  it('o período vem da URL e USUARIO recebe a versão reduzida', async () => {
    const r = montar('USUARIO', true, '/painel?periodo=7')
    expect(await screen.findByText('Em aberto por status')).toBeInTheDocument()
    expect(screen.queryByText('Em aberto por área')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Minha fila/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Área')).not.toBeInTheDocument()
    const chamada = r.falsa.chamadas.find((c) => c.url.startsWith('/api/v1/painel'))
    expect(chamada?.url).toContain('periodo=7')
  })
})
