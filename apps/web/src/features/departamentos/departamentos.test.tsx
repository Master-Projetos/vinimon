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

const departamento = (
  id: number,
  nome: string,
  unidadeId: number,
  unidade: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  unidadeId,
  nome,
  ativo: true,
  unidade: { id: unidadeId, nome: unidade },
  criadoEm: '2026-10-01T10:00:00.000Z',
  atualizadoEm: '2026-10-01T10:00:00.000Z',
  ...extra,
})

const lista = {
  'GET /departamentos': pagina([
    departamento(1, 'Financeiro', 1, 'Matriz'),
    departamento(2, 'Vendas', 2, 'Filial', { ativo: false }),
  ]),
  'GET /meta': meta,
}

describe('/admin/departamentos', () => {
  it('(a) lista os departamentos com a unidade', async () => {
    montar('/admin/departamentos', lista)
    expect(await screen.findByText('Financeiro')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Filial' })).toBeInTheDocument()
    expect(screen.getByText('Inativo')).toBeInTheDocument()
  })

  it('o filtro por unidade entra na URL e na query', async () => {
    const { falsa, router } = montar('/admin/departamentos?unidadeId=2', lista)
    await screen.findByText('Financeiro')
    expect(router.state.location.search).toMatchObject({ unidadeId: 2 })
    expect(falsa.chamadas.some((c) => c.metodo === 'GET' && c.url.includes('unidadeId=2'))).toBe(true)
  })

  it('(b) criar faz POST /departamentos com o body esperado', async () => {
    const { falsa } = montar('/admin/departamentos', {
      ...lista,
      'POST /departamentos': () => json(departamento(3, 'Jurídico', 1, 'Matriz'), 201),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Novo departamento/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Jurídico' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/departamentos',
        corpo: { nome: 'Jurídico', unidadeId: 1, ativo: true },
      }),
    )
    expect(await screen.findByText('Departamento criado')).toBeInTheDocument()
  })

  it('(b) editar troca a unidade e faz PATCH /departamentos/:id', async () => {
    const { falsa } = montar('/admin/departamentos', {
      ...lista,
      'PATCH /departamentos/1': () => json(departamento(1, 'Financeiro', 2, 'Filial')),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Financeiro' }))
    expect(await screen.findByLabelText(/^Nome/)).toHaveValue('Financeiro')
    fireEvent.pointerDown(screen.getByRole('combobox', { name: /^Unidade/ }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    fireEvent.click(await screen.findByRole('option', { name: 'Filial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/departamentos/1',
        corpo: { nome: 'Financeiro', unidadeId: 2, ativo: true },
      }),
    )
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar('/admin/departamentos', {
      ...lista,
      'POST /departamentos': () => erro400('nome', 'Nome já usado na unidade.'),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Novo departamento/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Financeiro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Nome já usado na unidade.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar('/admin/departamentos', {
      'GET /departamentos': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status),
      'GET /meta': meta,
    })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
  it('excluir confirma e faz DELETE /departamentos/1', async () => {
    const { falsa } = montar('/admin/departamentos', {
      ...lista,
      'DELETE /departamentos/1': () => new Response(null, { status: 204 }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Financeiro' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({ metodo: 'DELETE', url: '/api/v1/departamentos/1', corpo: null }),
    )
    expect(await screen.findByText('Departamento excluído')).toBeInTheDocument()
  })

  it('409 ao excluir mostra a mensagem do servidor', async () => {
    montar('/admin/departamentos', {
      ...lista,
      'DELETE /departamentos/1': () =>
        json(
          { erro: { codigo: 'REGISTRO_EM_USO', mensagem: 'O departamento está em uso e não pode ser excluído.' } },
          409,
        ),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Financeiro' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('O departamento está em uso e não pode ser excluído.')).toBeInTheDocument()
  })
})
