import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

// Radix (Popper) usa ResizeObserver, e o jsdom não tem ResizeObserver nem scrollIntoView.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

function sessaoDe(perfil: UsuarioMe['perfil']): SessaoResposta {
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

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

const resumo = (id: number, titulo: string, visibilidade: 'PUBLICO' | 'INTERNO' = 'PUBLICO') => ({
  id,
  titulo,
  resumo: `Resumo de ${titulo}`,
  categoriaId: 1,
  situacao: 'PUBLICADO',
  visibilidade,
  visualizacoes: 3,
  publicadoEm: '2026-05-01T12:00:00.000Z',
  atualizadoEm: '2026-05-02T12:00:00.000Z',
})

const artigo = (id: number, problemaIds: number[]) => ({
  ...resumo(id, 'Como configurar a VPN', 'INTERNO'),
  conteudo: '## Passo a passo\n\nAbra o cliente VPN.',
  autorId: 2,
  problemaIds,
  votosUteis: 1,
  votosNaoUteis: 0,
})

const pagina = (itens: unknown[]) => ({ itens, total: itens.length, pagina: 1, porPagina: 25 })
const categorias = pagina([{ id: 1, nome: 'Tutoriais', ordem: 1, ativo: true }])

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(
  caminho: string,
  respostas: Parameters<typeof renderRota>[1]['respostas'],
  perfil: UsuarioMe['perfil'] = 'USUARIO',
) {
  const r = renderRota(caminho, { sessao: sessaoDe(perfil), respostas })
  falsaAtual = r.falsa
  return r
}

describe('/conhecimento', () => {
  it('(a) lista artigos e categorias, com o badge Interno', async () => {
    montar(
      '/conhecimento',
      {
        'GET /artigos': pagina([resumo(1, 'Como configurar a VPN', 'INTERNO'), resumo(2, 'Trocar a senha')]),
        'GET /categorias-artigo': categorias,
      },
      'OPERADOR',
    )
    expect(await screen.findByText('Como configurar a VPN')).toBeInTheDocument()
    expect(screen.getByText('Trocar a senha')).toBeInTheDocument()
    expect(screen.getAllByText('Interno')).toHaveLength(1)
    expect(await screen.findByRole('link', { name: 'Tutoriais' })).toBeInTheDocument()
  })

  it('busca sem resultado mostra o EmptyState com "Abrir chamado"', async () => {
    montar('/conhecimento?busca=xyz', { 'GET /artigos': pagina([]), 'GET /categorias-artigo': categorias })
    expect(await screen.findByText('Nenhum artigo encontrado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir chamado' })).toHaveAttribute('href', '/chamados/novo')
  })

  it('(d) 403 ao listar mostra o ErrorState', async () => {
    montar('/conhecimento', {
      'GET /artigos': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, 403),
      'GET /categorias-artigo': categorias,
    })
    expect(await screen.findByText('Você não tem acesso a este conteúdo')).toBeInTheDocument()
  })
})

describe('/conhecimento/$artigoId', () => {
  it('(a) mostra o artigo, vota e aponta "Abrir chamado" para o problema', async () => {
    const { falsa } = montar('/conhecimento/5', {
      'GET /artigos/5': artigo(5, [9]),
      'POST /artigos/5/voto': () => new Response(null, { status: 204 }),
    })
    expect(await screen.findByRole('heading', { name: 'Passo a passo' })).toBeInTheDocument()
    expect(screen.getByText('Interno')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir chamado' })).toHaveAttribute('href', '/chamados/novo?problema=9')
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/artigos/5/voto',
        corpo: { util: true },
      }),
    )
    expect(await screen.findByText('Obrigado pelo retorno!')).toBeInTheDocument()
  })

  it('(d) 404 mostra o ErrorState', async () => {
    montar('/conhecimento/5', {
      'GET /artigos/5': () => json({ erro: { codigo: 'ERRO', mensagem: 'Não existe.' } }, 404),
    })
    expect(await screen.findByText('Não encontrado')).toBeInTheDocument()
  })
})
