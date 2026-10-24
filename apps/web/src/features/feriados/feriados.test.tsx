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

const feriado = (id: number, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  data: '2026-12-25',
  nome,
  recorrente: false,
  jornadaId: null,
  criadoEm: '2026-10-01T10:00:00.000Z',
  ...extra,
})

const lista = {
  'GET /feriados': pagina([feriado(1, 'Natal'), feriado(2, 'Tiradentes', { data: '2000-04-21', recorrente: true })]),
  'GET /meta': meta,
}

describe('/admin/feriados', () => {
  it('(a) lista os feriados', async () => {
    montar('/admin/feriados', lista)
    expect(await screen.findByText('Natal')).toBeInTheDocument()
    expect(screen.getByText('25/12/2026')).toBeInTheDocument()
    expect(screen.getByText('21/04')).toBeInTheDocument()
    expect(screen.getByText('Todo ano')).toBeInTheDocument()
  })

  it('(b) criar faz POST /feriados com a data escolhida no calendário', async () => {
    const { falsa } = montar('/admin/feriados', {
      ...lista,
      'POST /feriados': () => json(feriado(3, 'Aniversário'), 201),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Novo feriado/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Aniversário' } })
    fireEvent.click(screen.getByRole('button', { name: /^Data/ }))
    const dia = (await screen.findAllByRole('gridcell')).find((c) => c.textContent === '15')
    expect(dia).toBeDefined()
    const botao = dia?.querySelector('button')
    expect(botao).not.toBeNull()
    if (botao) fireEvent.click(botao)
    fireEvent.click(screen.getByRole('switch', { name: 'Repete todo ano' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => {
      const chamada = falsa.chamadas.find((c) => c.metodo === 'POST' && c.url === '/api/v1/feriados')
      expect(chamada?.corpo).toMatchObject({ nome: 'Aniversário', recorrente: true, jornadaId: null })
      expect(chamada?.corpo).toHaveProperty('data', expect.stringMatching(/^\d{4}-\d{2}-15$/))
    })
  })

  it('(b) editar faz PUT /feriados/:id com o body esperado', async () => {
    const { falsa } = montar('/admin/feriados', { ...lista, 'PUT /feriados/1': () => json(feriado(1, 'Natal 2026')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Natal' }))
    const campo = await screen.findByLabelText(/^Nome/)
    expect(campo).toHaveValue('Natal')
    fireEvent.change(campo, { target: { value: 'Natal 2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PUT',
        url: '/api/v1/feriados/1',
        corpo: { data: '2026-12-25', nome: 'Natal 2026', recorrente: false, jornadaId: null },
      }),
    )
  })

  it('o filtro por ano entra na query', async () => {
    const { falsa } = montar('/admin/feriados', lista)
    fireEvent.change(await screen.findByLabelText('Ano'), { target: { value: '2026' } })
    await waitFor(() => expect(falsa.chamadas.some((c) => c.metodo === 'GET' && c.url.includes('ano=2026'))).toBe(true))
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar('/admin/feriados', { ...lista, 'PUT /feriados/1': () => erro400('nome', 'Nome já usado.') })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Natal' }))
    await screen.findByLabelText(/^Nome/)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Nome já usado.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar('/admin/feriados', {
      'GET /feriados': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status),
    })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
