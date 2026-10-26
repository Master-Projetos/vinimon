import { cleanup, fireEvent, screen } from '@testing-library/react'
import { CONFIG_PADRAO, type Meta, type SessaoResposta, type UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const meta: Meta = {
  areas: [{ id: 1, nome: 'Financeiro', atende: false }],
  prioridades: [],
  status: [],
  problemas: [],
  canais: [],
  departamentos: [{ id: 5, nome: 'Contabilidade', unidadeId: 1 }],
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
  const r = renderRota(caminho, { sessao: sessaoDe('USUARIO'), respostas })
  falsaAtual = r.falsa
  return r
}

const gerido = (id: number, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  telefone: '1199999',
  departamentoId: 5,
  ativo: true,
  ...extra,
})

const lista = {
  'GET /areas-geridas/1/usuarios': [
    gerido(10, 'Carla Dias'),
    gerido(11, 'Davi Melo', { telefone: null, ativo: false }),
  ],
  'GET /meta': meta,
}

async function waitForPatch(falsa: ApiFalsa) {
  await vi.waitFor(() => expect(falsa.chamadas.some((c) => c.metodo === 'PATCH')).toBe(true))
}

describe('/areas-geridas', () => {
  it('(a) renderiza os usuários da área', async () => {
    montar('/areas-geridas', lista)
    expect(await screen.findByText('Carla Dias')).toBeInTheDocument()
    expect(screen.getByText('Davi Melo')).toBeInTheDocument()
    expect(screen.getAllByText('Contabilidade').length).toBeGreaterThan(0)
    expect(screen.getByText('Inativo')).toBeInTheDocument()
  })

  it('(b) salvar faz PATCH com telefone, departamento e ativo', async () => {
    const { falsa } = montar('/areas-geridas', {
      ...lista,
      'PATCH /areas-geridas/1/usuarios/10': () => json(gerido(10, 'Carla Dias', { telefone: '1188888' })),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Carla Dias' }))
    fireEvent.change(await screen.findByLabelText(/^Telefone/), { target: { value: '1188888' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitForPatch(falsa)
    const patch = falsa.chamadas.find((c) => c.metodo === 'PATCH')
    expect(patch?.corpo).toEqual({ telefone: '1188888', departamentoId: 5, ativo: true })
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar('/areas-geridas', {
      ...lista,
      'PATCH /areas-geridas/1/usuarios/10': () => erro400('telefone', 'Telefone inválido para a área.'),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Carla Dias' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Telefone inválido para a área.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar('/areas-geridas', {
      'GET /areas-geridas/1/usuarios': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status),
      'GET /meta': meta,
    })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
