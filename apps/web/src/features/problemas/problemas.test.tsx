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
  areas: [
    { id: 1, nome: 'TI', atende: true },
    { id: 2, nome: 'Financeiro', atende: true },
  ],
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

const problema = (id: number, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  descricao: null,
  areaPadraoId: 1,
  slaRespostaMin: null,
  slaSolucaoMin: 480,
  ativo: true,
  areas: [{ id: 1, nome: 'TI' }],
  ...extra,
})

const lista = {
  'GET /problemas': pagina([
    problema(1, 'Impressora'),
    problema(2, 'Acesso', {
      ativo: false,
      areas: [
        { id: 1, nome: 'TI' },
        { id: 2, nome: 'Financeiro' },
      ],
    }),
  ]),
  'GET /meta': meta,
}

describe('/admin/problemas', () => {
  it('(a) lista os tipos de problema com as áreas e os prazos', async () => {
    montar('/admin/problemas', lista)
    expect(await screen.findByText('Impressora')).toBeInTheDocument()
    expect(screen.getByText('TI, Financeiro')).toBeInTheDocument()
    expect(screen.getAllByText('480 min')).toHaveLength(2)
    expect(screen.getByText('Inativo')).toBeInTheDocument()
  })

  it('(b) criar com uma área faz POST /problemas com a área padrão igual à escolhida', async () => {
    const { falsa } = montar('/admin/problemas', { ...lista, 'POST /problemas': () => json(problema(3, 'Rede'), 201) })
    fireEvent.click(await screen.findByRole('button', { name: /Novo tipo de problema/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Rede' } })
    fireEvent.click(screen.getByRole('combobox', { name: /^Áreas/ }))
    fireEvent.click(await screen.findByRole('option', { name: /Financeiro/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/problemas',
        corpo: {
          nome: 'Rede',
          descricao: '',
          areaIds: [2],
          areaPadraoId: 2,
          slaRespostaMin: null,
          slaSolucaoMin: null,
          ativo: true,
        },
      }),
    )
    expect(await screen.findByText('Tipo de problema criado')).toBeInTheDocument()
  })

  it('(b) editar faz PATCH /problemas/:id com o body esperado', async () => {
    const { falsa } = montar('/admin/problemas', {
      ...lista,
      'PATCH /problemas/1': () => json(problema(1, 'Impressoras')),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Impressora' }))
    const campo = await screen.findByLabelText(/^Nome/)
    expect(campo).toHaveValue('Impressora')
    fireEvent.change(campo, { target: { value: 'Impressoras' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/problemas/1',
        corpo: {
          nome: 'Impressoras',
          descricao: '',
          areaIds: [1],
          areaPadraoId: 1,
          slaRespostaMin: null,
          slaSolucaoMin: 480,
          ativo: true,
        },
      }),
    )
  })

  it('sem escolher área, o formulário bloqueia e não chama a API', async () => {
    const { falsa } = montar('/admin/problemas', lista)
    fireEvent.click(await screen.findByRole('button', { name: /Novo tipo de problema/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Rede' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Informe ao menos uma área.')).toBeInTheDocument()
    expect(falsa.chamadas.some((c) => c.metodo === 'POST')).toBe(false)
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar('/admin/problemas', { ...lista, 'POST /problemas': () => erro400('nome', 'Nome já usado.') })
    fireEvent.click(await screen.findByRole('button', { name: /Novo tipo de problema/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Impressora' } })
    fireEvent.click(screen.getByRole('combobox', { name: /^Áreas/ }))
    fireEvent.click(await screen.findByRole('option', { name: /TI/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Nome já usado.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar('/admin/problemas', {
      'GET /problemas': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status),
      'GET /meta': meta,
    })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
  it('excluir confirma e faz DELETE /problemas/1', async () => {
    const { falsa } = montar('/admin/problemas', {
      ...lista,
      'DELETE /problemas/1': () => new Response(null, { status: 204 }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Impressora' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({ metodo: 'DELETE', url: '/api/v1/problemas/1', corpo: null }),
    )
    expect(await screen.findByText('Tipo de problema excluído')).toBeInTheDocument()
  })

  it('409 ao excluir mostra a mensagem do servidor', async () => {
    montar('/admin/problemas', {
      ...lista,
      'DELETE /problemas/1': () =>
        json(
          { erro: { codigo: 'REGISTRO_EM_USO', mensagem: 'O tipo de problema está em uso e não pode ser excluído.' } },
          409,
        ),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Impressora' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('O tipo de problema está em uso e não pode ser excluído.')).toBeInTheDocument()
  })
})
