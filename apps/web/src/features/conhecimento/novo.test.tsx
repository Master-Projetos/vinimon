import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { CONFIG_PADRAO, type Meta, type SessaoResposta, type UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

// Radix (Popper/Select) usa APIs que o jsdom não tem.
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
const categorias = { itens: [{ id: 1, nome: 'Tutoriais', ordem: 1, ativo: true }], total: 1, pagina: 1, porPagina: 100 }

const artigoApi = (extra: Record<string, unknown> = {}) => ({
  id: 5,
  titulo: 'Como configurar a VPN',
  resumo: null,
  categoriaId: 1,
  situacao: 'PUBLICADO',
  visibilidade: 'PUBLICO',
  visualizacoes: 3,
  publicadoEm: '2026-05-01T12:00:00.000Z',
  atualizadoEm: '2026-05-02T12:00:00.000Z',
  conteudo: 'Abra o cliente VPN.',
  autorId: 2,
  problemaIds: [9],
  votosUteis: 1,
  votosNaoUteis: 0,
  ...extra,
})

const erro400 = {
  erro: {
    codigo: 'VALIDACAO',
    mensagem: 'Dados inválidos.',
    detalhes: [{ campo: 'titulo', mensagem: 'Já existe um artigo com este título.' }],
  },
}

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(
  caminho: string,
  respostas: Parameters<typeof renderRota>[1]['respostas'],
  perfil: UsuarioMe['perfil'] = 'ADMIN',
) {
  const r = renderRota(caminho, {
    sessao: sessaoDe(perfil),
    respostas: { 'GET /meta': meta, 'GET /categorias-artigo': categorias, ...respostas },
  })
  falsaAtual = r.falsa
  return r
}

async function escolherVisibilidadeInterna() {
  fireEvent.keyDown(await screen.findByRole('combobox', { name: 'Visibilidade' }), { key: 'Enter' })
  fireEvent.click(await screen.findByRole('option', { name: /^Interno/ }))
}

describe('/conhecimento/novo', () => {
  it('(a) renderiza o formulário vazio', async () => {
    montar('/conhecimento/novo', {})
    expect(await screen.findByLabelText(/^Título/)).toHaveValue('')
    expect(screen.getByRole('heading', { name: 'Novo artigo' })).toBeInTheDocument()
  })

  it('(b) salvar faz POST /artigos com o body esperado (visibilidade INTERNO)', async () => {
    const { falsa } = montar('/conhecimento/novo', {
      'POST /artigos': () => json(artigoApi({ visibilidade: 'INTERNO' }), 201),
      'GET /artigos/5': artigoApi({ visibilidade: 'INTERNO' }),
    })
    fireEvent.change(await screen.findByLabelText(/^Título/), { target: { value: 'Como configurar a VPN' } })
    fireEvent.change(screen.getByLabelText(/^Conteúdo/), { target: { value: 'Abra o cliente VPN.' } })
    await escolherVisibilidadeInterna()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/artigos',
        corpo: {
          titulo: 'Como configurar a VPN',
          resumo: null,
          conteudo: 'Abra o cliente VPN.',
          categoriaId: null,
          situacao: 'RASCUNHO',
          visibilidade: 'INTERNO',
          problemaIds: [],
        },
      }),
    )
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar('/conhecimento/novo', { 'POST /artigos': () => json(erro400, 400) })
    fireEvent.change(await screen.findByLabelText(/^Título/), { target: { value: 'Como configurar a VPN' } })
    fireEvent.change(screen.getByLabelText(/^Conteúdo/), { target: { value: 'Texto.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Já existe um artigo com este título.')).toBeInTheDocument()
  })

  it('(d) USUARIO é levado a /sem-permissao', async () => {
    const r = montar('/conhecimento/novo', {}, 'USUARIO')
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/sem-permissao'))
    expect(await screen.findByText('Você não tem acesso a este conteúdo')).toBeInTheDocument()
  })
})
