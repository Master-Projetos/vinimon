import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { CONFIG_PADRAO, type Meta, type SessaoResposta, type UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

// Radix (Popper) usa ResizeObserver, que o jsdom não tem.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
// O Select do Radix também usa estas APIs de ponteiro e rolagem.
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

const pagina = (itens: unknown[]) => ({ itens, total: itens.length, pagina: 1, porPagina: 25 })

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

const erro400 = (campo: string, mensagem: string) =>
  json({ erro: { codigo: 'VALIDACAO', mensagem: 'Dados inválidos.', detalhes: [{ campo, mensagem }] } }, 400)

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(caminho: string, respostas: Parameters<typeof renderRota>[1]['respostas']) {
  const r = renderRota(caminho, { sessao: sessaoDe('ADMIN'), respostas })
  falsaAtual = r.falsa
  return r
}

const canal = (id: number, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  sistema: false,
  ativo: true,
  ...extra,
})

const lista = {
  'GET /canais': pagina([canal(1, 'Telefone', { sistema: true }), canal(2, 'Balcão', { ativo: false })]),
  'GET /meta': meta,
}

describe('/admin/canais', () => {
  it('(a) lista os canais e desabilita o Excluir dos canais do sistema', async () => {
    montar('/admin/canais', lista)
    expect(await screen.findByText('Telefone')).toBeInTheDocument()
    expect(screen.getByText('Do sistema')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excluir Telefone' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Excluir Balcão' })).toBeEnabled()
  })

  it('(b) criar faz POST /canais com o body esperado', async () => {
    const { falsa } = montar('/admin/canais', { ...lista, 'POST /canais': () => json(canal(3, 'Chat'), 201) })
    fireEvent.click(await screen.findByRole('button', { name: /Novo canal/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Chat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/canais',
        corpo: { nome: 'Chat', ativo: true },
      }),
    )
    expect(await screen.findByText('Canal criado')).toBeInTheDocument()
  })

  it('(b) editar faz PATCH /canais/:id com o body esperado', async () => {
    const { falsa } = montar('/admin/canais', { ...lista, 'PATCH /canais/2': () => json(canal(2, 'Balcão 2')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Balcão' }))
    const campo = await screen.findByLabelText(/^Nome/)
    expect(campo).toHaveValue('Balcão')
    fireEvent.change(campo, { target: { value: 'Balcão 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/canais/2',
        corpo: { nome: 'Balcão 2', ativo: false },
      }),
    )
  })

  it('excluir um canal que não é do sistema confirma e faz DELETE /canais/:id', async () => {
    const { falsa } = montar('/admin/canais', {
      ...lista,
      'DELETE /canais/2': () => new Response(null, { status: 204 }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Balcão' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({ metodo: 'DELETE', url: '/api/v1/canais/2', corpo: null }),
    )
    expect(await screen.findByText('Canal excluído')).toBeInTheDocument()
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar('/admin/canais', { ...lista, 'POST /canais': () => erro400('nome', 'Nome já usado.') })
    fireEvent.click(await screen.findByRole('button', { name: /Novo canal/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Telefone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Nome já usado.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar('/admin/canais', { 'GET /canais': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status) })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
