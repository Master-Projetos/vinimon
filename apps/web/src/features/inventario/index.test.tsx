import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
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

const ativo = (id: number, etiqueta: string, extra: Record<string, unknown> = {}) => ({
  id,
  etiqueta,
  tipoId: 1,
  tipo: 'Notebook',
  modelo: 'Latitude 5440',
  serie: `SN${id}`,
  departamentoId: null,
  departamento: null,
  responsavelId: null,
  responsavelTexto: null,
  situacao: 'EM_USO',
  observacao: null,
  qtdChamados: 2,
  criadoEm: '2026-10-01T10:00:00.000Z',
  atualizadoEm: '2026-10-01T10:00:00.000Z',
  ...extra,
})

const pagina = (itens: unknown[]) => ({ itens, total: itens.length, pagina: 1, porPagina: 25 })

const meta: Meta = {
  areas: [],
  prioridades: [],
  status: [],
  problemas: [],
  canais: [],
  departamentos: [{ id: 5, nome: 'Financeiro', unidadeId: 1 }],
  unidades: [],
  tiposAtivo: [
    { id: 1, nome: 'Notebook' },
    { id: 2, nome: 'Monitor' },
  ],
  jornadas: [],
  categorias: [],
  config: Object.fromEntries(Object.entries(CONFIG_PADRAO)) as Meta['config'],
}

const lista = pagina([ativo(1, 'PAT-001'), ativo(2, 'PAT-002', { situacao: 'EM_MANUTENCAO', modelo: null })])

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(respostas: Parameters<typeof renderRota>[1]['respostas'], perfil: UsuarioMe['perfil'] = 'ADMIN') {
  const r = renderRota('/inventario', { sessao: sessaoDe(perfil), respostas })
  falsaAtual = r.falsa
  return r
}

describe('/inventario', () => {
  it('(a) renderiza os ativos, os tipos e a situação de cada um', async () => {
    montar({ 'GET /ativos': lista, 'GET /meta': meta })
    expect(await screen.findByText('PAT-001')).toBeInTheDocument()
    const linha = screen.getByText('PAT-002').closest('tr')
    expect(linha).not.toBeNull()
    if (linha) expect(within(linha).getByText('Em manutenção')).toBeInTheDocument()
    const tipos = await screen.findByRole('navigation', { name: 'Tipos de ativo' })
    expect(within(tipos).getByRole('link', { name: 'Monitor' })).toBeInTheDocument()
    expect(within(tipos).getByRole('link', { name: 'Todos os tipos' })).toHaveAttribute('aria-current', 'page')
  })

  it('escolher um tipo filtra pela URL e pela API', async () => {
    const { falsa, router } = montar({ 'GET /ativos': lista, 'GET /meta': meta })
    const tipos = await screen.findByRole('navigation', { name: 'Tipos de ativo' })
    fireEvent.click(within(tipos).getByRole('link', { name: 'Monitor' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tipoId: 2 }))
    await waitFor(() => expect(falsa.chamadas.some((c) => c.metodo === 'GET' && c.url.includes('tipoId=2'))).toBe(true))
  })

  it('(b) criar faz POST /ativos com o body esperado', async () => {
    const { falsa } = montar({
      'GET /ativos': lista,
      'GET /meta': meta,
      'POST /ativos': () => json(ativo(3, 'PAT-003'), 201),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Novo ativo/ }))
    fireEvent.change(await screen.findByLabelText(/^Etiqueta/), { target: { value: 'PAT-003' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/ativos',
        corpo: {
          etiqueta: 'PAT-003',
          tipoId: 1,
          modelo: null,
          serie: null,
          departamentoId: null,
          responsavelTexto: null,
          situacao: 'EM_USO',
          observacao: null,
        },
      }),
    )
    expect(await screen.findByText('Ativo criado')).toBeInTheDocument()
  })

  it('(b) editar faz PATCH /ativos/:id com o body esperado', async () => {
    const { falsa } = montar({
      'GET /ativos': lista,
      'GET /meta': meta,
      'PATCH /ativos/1': () => json(ativo(1, 'PAT-001', { departamentoId: 5, departamento: 'Financeiro' })),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar PAT-001' }))
    expect(await screen.findByLabelText(/^Etiqueta/)).toHaveValue('PAT-001')
    fireEvent.pointerDown(screen.getByRole('combobox', { name: /Departamento/ }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    fireEvent.click(await screen.findByRole('option', { name: 'Financeiro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => {
      const patch = falsa.chamadas.find((c) => c.metodo === 'PATCH')
      expect(patch).toMatchObject({ url: '/api/v1/ativos/1', corpo: { etiqueta: 'PAT-001', departamentoId: 5 } })
    })
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar({
      'GET /ativos': lista,
      'GET /meta': meta,
      'POST /ativos': () =>
        json(
          {
            erro: {
              codigo: 'VALIDACAO',
              mensagem: 'Dados inválidos.',
              detalhes: [{ campo: 'etiqueta', mensagem: 'Etiqueta já usada.' }],
            },
          },
          400,
        ),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Novo ativo/ }))
    fireEvent.change(await screen.findByLabelText(/^Etiqueta/), { target: { value: 'PAT-001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Etiqueta já usada.')).toBeInTheDocument()
  })

  it('(d) 403 da API mostra o ErrorState', async () => {
    montar({
      'GET /ativos': () => json({ erro: { codigo: 'SEM_PERMISSAO', mensagem: 'Negado.' } }, 403),
      'GET /meta': meta,
    })
    expect(await screen.findByText('Você não tem acesso a este conteúdo')).toBeInTheDocument()
  })

  it('(d) USUARIO é levado a /sem-permissao', async () => {
    const r = montar({}, 'USUARIO')
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/sem-permissao'))
  })
})
