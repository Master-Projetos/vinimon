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

const status = (id: number, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  tipo: 'ABERTO',
  papel: null,
  cor: '#2563eb',
  pausaSla: false,
  ignorado: false,
  ordem: id,
  ativo: true,
  ...extra,
})

const lista = {
  'GET /status': pagina([
    status(1, 'Novo', { papel: 'INICIAL' }),
    status(2, 'Aguardando peça', { tipo: 'PENDENTE', pausaSla: true, ativo: false }),
  ]),
  'GET /meta': meta,
}

function escolher(nome: RegExp, opcao: string) {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: nome }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  return screen.findByRole('option', { name: opcao }).then((o) => fireEvent.click(o))
}

describe('/admin/status', () => {
  it('(a) lista os status com tipo, papel e prévia', async () => {
    montar('/admin/status', lista)
    // o nome aparece na coluna Nome e na Prévia
    expect(await screen.findAllByText('Novo')).toHaveLength(2)
    expect(screen.getByRole('cell', { name: 'Inicial' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Pendente' })).toBeInTheDocument()
    expect(screen.getByText('Inativo')).toBeInTheDocument()
  })

  it('(b) escolher o papel ajusta o tipo e o POST sai com o body esperado', async () => {
    const { falsa } = montar('/admin/status', {
      ...lista,
      'POST /status': () => json(status(3, 'Aguardando cliente'), 201),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Novo status/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Aguardando cliente' } })
    await escolher(/^Papel/, 'Aguardando solicitante')
    await waitFor(() => expect(screen.getByRole('combobox', { name: /^Tipo/ })).toHaveTextContent('Pendente'))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/status',
        corpo: {
          nome: 'Aguardando cliente',
          tipo: 'PENDENTE',
          papel: 'AGUARDANDO_SOLICITANTE',
          cor: '#2563eb',
          pausaSla: false,
          ignorado: false,
          ordem: 0,
          ativo: true,
        },
      }),
    )
    expect(await screen.findByText('Status criado')).toBeInTheDocument()
  })

  it('com papel escolhido, o tipo só oferece o tipo do papel', async () => {
    montar('/admin/status', lista)
    fireEvent.click(await screen.findByRole('button', { name: /Novo status/ }))
    await escolher(/^Papel/, 'Cancelado')
    fireEvent.pointerDown(screen.getByRole('combobox', { name: /^Tipo/ }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    const opcoes = await screen.findAllByRole('option')
    expect(opcoes.map((o) => o.textContent)).toEqual(['Encerrado'])
  })

  it('(b) editar faz PATCH /status/:id com o body esperado', async () => {
    const { falsa } = montar('/admin/status', {
      ...lista,
      'PATCH /status/1': () => json(status(1, 'Recebido', { papel: 'INICIAL' })),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Novo' }))
    const campo = await screen.findByLabelText(/^Nome/)
    expect(campo).toHaveValue('Novo')
    fireEvent.change(campo, { target: { value: 'Recebido' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/status/1',
        corpo: {
          nome: 'Recebido',
          tipo: 'ABERTO',
          papel: 'INICIAL',
          cor: '#2563eb',
          pausaSla: false,
          ignorado: false,
          ordem: 1,
          ativo: true,
        },
      }),
    )
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar('/admin/status', { ...lista, 'POST /status': () => erro400('nome', 'Nome já usado.') })
    fireEvent.click(await screen.findByRole('button', { name: /Novo status/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Novo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Nome já usado.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (st, titulo) => {
    montar('/admin/status', { 'GET /status': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, st) })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
  it('excluir confirma e faz DELETE /status/2', async () => {
    const { falsa } = montar('/admin/status', {
      ...lista,
      'DELETE /status/2': () => new Response(null, { status: 204 }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Aguardando peça' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({ metodo: 'DELETE', url: '/api/v1/status/2', corpo: null }),
    )
    expect(await screen.findByText('Status excluído')).toBeInTheDocument()
  })

  it('409 ao excluir mostra a mensagem do servidor', async () => {
    montar('/admin/status', {
      ...lista,
      'DELETE /status/2': () =>
        json({ erro: { codigo: 'REGISTRO_EM_USO', mensagem: 'O status está em uso e não pode ser excluído.' } }, 409),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Aguardando peça' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('O status está em uso e não pode ser excluído.')).toBeInTheDocument()
  })

  it('status com papel tem o botão de excluir desabilitado', async () => {
    montar('/admin/status', lista)
    const botao = await screen.findByRole('button', { name: 'Excluir Novo' })
    expect(botao).toBeDisabled()
    expect(botao).toHaveAttribute('title', 'Status com papel no fluxo não pode ser excluído.')
    expect(screen.getByRole('button', { name: 'Excluir Aguardando peça' })).toBeEnabled()
  })
})
