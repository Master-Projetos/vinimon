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
  unidades: [
    { id: 1, nome: 'Matriz' },
    { id: 2, nome: 'Filial' },
  ],
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

const unidade = (id: number, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  endereco: null,
  ativo: true,
  criadoEm: '2026-10-01T10:00:00.000Z',
  atualizadoEm: '2026-10-01T10:00:00.000Z',
  ...extra,
})

const lista = {
  'GET /unidades': pagina([unidade(1, 'Matriz', { endereco: 'Rua A, 10' }), unidade(2, 'Filial', { ativo: false })]),
  'GET /meta': meta,
}

describe('/admin/unidades', () => {
  it('(a) lista as unidades', async () => {
    montar('/admin/unidades', lista)
    expect(await screen.findByText('Matriz')).toBeInTheDocument()
    expect(screen.getByText('Rua A, 10')).toBeInTheDocument()
    expect(screen.getByText('Inativa')).toBeInTheDocument()
  })

  it('(b) criar faz POST /unidades com o body esperado', async () => {
    const { falsa } = montar('/admin/unidades', { ...lista, 'POST /unidades': () => json(unidade(3, 'Anexo'), 201) })
    fireEvent.click(await screen.findByRole('button', { name: /Nova unidade/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Anexo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/unidades',
        corpo: { nome: 'Anexo', endereco: null, ativo: true },
      }),
    )
    expect(await screen.findByText('Unidade criada')).toBeInTheDocument()
  })

  it('(b) editar faz PATCH /unidades/:id com o body esperado', async () => {
    const { falsa } = montar('/admin/unidades', { ...lista, 'PATCH /unidades/1': () => json(unidade(1, 'Matriz SP')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Matriz' }))
    const campo = await screen.findByLabelText(/^Nome/)
    expect(campo).toHaveValue('Matriz')
    fireEvent.change(campo, { target: { value: 'Matriz SP' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/unidades/1',
        corpo: { nome: 'Matriz SP', endereco: 'Rua A, 10', ativo: true },
      }),
    )
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar('/admin/unidades', { ...lista, 'POST /unidades': () => erro400('nome', 'Nome já usado.') })
    fireEvent.click(await screen.findByRole('button', { name: /Nova unidade/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Matriz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Nome já usado.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar('/admin/unidades', {
      'GET /unidades': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status),
    })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
  it('excluir confirma e faz DELETE /unidades/1', async () => {
    const { falsa } = montar('/admin/unidades', {
      ...lista,
      'DELETE /unidades/1': () => new Response(null, { status: 204 }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Matriz' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({ metodo: 'DELETE', url: '/api/v1/unidades/1', corpo: null }),
    )
    expect(await screen.findByText('Unidade excluída')).toBeInTheDocument()
  })

  it('409 ao excluir mostra a mensagem do servidor', async () => {
    montar('/admin/unidades', {
      ...lista,
      'DELETE /unidades/1': () =>
        json({ erro: { codigo: 'REGISTRO_EM_USO', mensagem: 'A unidade está em uso e não pode ser excluída.' } }, 409),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Matriz' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('A unidade está em uso e não pode ser excluída.')).toBeInTheDocument()
  })
})
