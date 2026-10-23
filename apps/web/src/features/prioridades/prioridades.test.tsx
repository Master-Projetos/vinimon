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

const prioridade = (id: number, nome: string, cor: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  cor,
  ordem: id,
  padrao: false,
  slaRespostaMin: null,
  slaSolucaoMin: 480,
  ativo: true,
  ...extra,
})

const lista = {
  'GET /prioridades': pagina([
    prioridade(1, 'Alta', '#dc2626'),
    prioridade(2, 'Baixa', '#16a34a', { ativo: false, padrao: true }),
  ]),
  'GET /meta': meta,
}

describe('/admin/prioridades', () => {
  it('(a) lista as prioridades com prévia e prazos', async () => {
    montar('/admin/prioridades', lista)
    // o nome aparece na coluna Nome e na Prévia
    expect(await screen.findAllByText('Alta')).toHaveLength(2)
    expect(screen.getAllByText('480 min')).toHaveLength(2)
    expect(screen.getByText('Inativa')).toBeInTheDocument()
    expect(screen.getByText('(padrão)')).toBeInTheDocument()
  })

  it('criar com #ffff00 mostra contraste de pelo menos 4,5 nas duas prévias', async () => {
    montar('/admin/prioridades', lista)
    fireEvent.click(await screen.findByRole('button', { name: /Nova prioridade/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Crítica' } })
    fireEvent.change(screen.getByLabelText('Cor em hexadecimal'), { target: { value: '#ffff00' } })
    await waitFor(() => expect(screen.getAllByText(/· AA$/)).toHaveLength(2))
    expect(screen.queryByText(/abaixo de AA/)).not.toBeInTheDocument()
    for (const razao of screen.getAllByText(/· AA$/)) {
      const numero = Number((razao.textContent ?? '').split(':')[0]?.replace(',', '.'))
      expect(numero).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('(b) criar faz POST /prioridades com o body esperado', async () => {
    const { falsa } = montar('/admin/prioridades', {
      ...lista,
      'POST /prioridades': () => json(prioridade(3, 'Crítica', '#ffff00'), 201),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Nova prioridade/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Crítica' } })
    fireEvent.change(screen.getByLabelText('Cor em hexadecimal'), { target: { value: '#ffff00' } })
    fireEvent.change(screen.getByLabelText('Prazo de solução (min)'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/prioridades',
        corpo: {
          nome: 'Crítica',
          cor: '#ffff00',
          ordem: 0,
          padrao: false,
          slaRespostaMin: null,
          slaSolucaoMin: 120,
          ativo: true,
        },
      }),
    )
    expect(await screen.findByText('Prioridade criada')).toBeInTheDocument()
  })

  it('(b) editar faz PATCH /prioridades/:id com o body esperado', async () => {
    const { falsa } = montar('/admin/prioridades', {
      ...lista,
      'PATCH /prioridades/1': () => json(prioridade(1, 'Muito alta', '#dc2626')),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Alta' }))
    const campo = await screen.findByLabelText(/^Nome/)
    expect(campo).toHaveValue('Alta')
    fireEvent.change(campo, { target: { value: 'Muito alta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/prioridades/1',
        corpo: {
          nome: 'Muito alta',
          cor: '#dc2626',
          ordem: 1,
          padrao: false,
          slaRespostaMin: null,
          slaSolucaoMin: 480,
          ativo: true,
        },
      }),
    )
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar('/admin/prioridades', { ...lista, 'POST /prioridades': () => erro400('nome', 'Nome já usado.') })
    fireEvent.click(await screen.findByRole('button', { name: /Nova prioridade/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Alta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Nome já usado.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar('/admin/prioridades', {
      'GET /prioridades': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status),
    })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
