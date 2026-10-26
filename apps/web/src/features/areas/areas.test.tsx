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

const area = (
  id: number,
  nome: string,
  extra: Partial<{ atende: boolean; ativo: boolean; jornadaId: number | null }> = {},
) => ({
  id,
  nome,
  atende: true,
  ativo: true,
  jornadaId: null,
  criadoEm: '2026-10-01T10:00:00.000Z',
  atualizadoEm: '2026-10-01T10:00:00.000Z',
  ...extra,
})

const pagina = (itens: unknown[]) => ({ itens, total: itens.length, pagina: 1, porPagina: 20 })

const meta: Meta = {
  areas: [],
  prioridades: [],
  status: [],
  problemas: [],
  canais: [],
  departamentos: [],
  unidades: [],
  tiposAtivo: [],
  jornadas: [{ id: 3, nome: 'Comercial' }],
  categorias: [],
  config: Object.fromEntries(Object.entries(CONFIG_PADRAO)) as Meta['config'],
}

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(respostas: Parameters<typeof renderRota>[1]['respostas'], perfil: UsuarioMe['perfil'] = 'ADMIN') {
  const r = renderRota('/admin/areas', { sessao: sessaoDe(perfil), respostas })
  falsaAtual = r.falsa
  return r
}

const listaPadrao = {
  'GET /areas': pagina([area(1, 'Financeiro'), area(2, 'Suporte', { atende: false, ativo: false })]),
  'GET /meta': meta,
}

describe('/admin/areas', () => {
  it('(a) lista as áreas no painel de administração', async () => {
    montar(listaPadrao)
    expect(await screen.findByText('Financeiro')).toBeInTheDocument()
    const linha = screen.getByText('Suporte').closest('tr')
    expect(linha).not.toBeNull()
    if (linha) {
      expect(within(linha).getByText('Não')).toBeInTheDocument()
      expect(within(linha).getByText('Inativa')).toBeInTheDocument()
    }
    expect(screen.getByRole('navigation', { name: 'Administração' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Áreas' })).toHaveAttribute('aria-current', 'page')
  })

  it('(b) criar faz POST /areas com o body esperado', async () => {
    const { falsa } = montar({ ...listaPadrao, 'POST /areas': () => json(area(3, 'Jurídico'), 201) })
    fireEvent.click(await screen.findByRole('button', { name: /Nova área/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Jurídico' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/areas',
        corpo: { nome: 'Jurídico', atende: true, ativo: true, jornadaId: null, moduloInventario: true, destinos: [] },
      }),
    )
    expect(await screen.findByText('Área criada')).toBeInTheDocument()
  })

  it('(b) editar faz PATCH /areas/:id com o body esperado', async () => {
    const { falsa } = montar({ ...listaPadrao, 'PATCH /areas/1': () => json(area(1, 'Financeiro Geral')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Financeiro' }))
    const campo = await screen.findByLabelText(/^Nome/)
    expect(campo).toHaveValue('Financeiro')
    fireEvent.change(campo, { target: { value: 'Financeiro Geral' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/areas/1',
        corpo: {
          nome: 'Financeiro Geral',
          atende: true,
          ativo: true,
          jornadaId: null,
          moduloInventario: true,
          destinos: [],
        },
      }),
    )
  })

  it('(b) destinos com padrão e módulo de inventário vão no PATCH', async () => {
    const outras = [
      { id: 1, nome: 'Financeiro', atende: true },
      { id: 5, nome: 'Compras', atende: true },
    ]
    const { falsa } = montar({
      ...listaPadrao,
      'GET /meta': { ...meta, areas: outras },
      'PATCH /areas/1': () => json(area(1, 'Financeiro')),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Financeiro' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Compras' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Padrão' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Módulo de inventário' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/areas/1',
        corpo: {
          nome: 'Financeiro',
          atende: true,
          ativo: true,
          jornadaId: null,
          moduloInventario: false,
          destinos: [{ areaId: 5, padrao: true }],
        },
      }),
    )
  })

  it('(b) excluir confirma e faz DELETE /areas/:id', async () => {
    const { falsa } = montar({ ...listaPadrao, 'DELETE /areas/1': () => new Response(null, { status: 204 }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Financeiro' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({ metodo: 'DELETE', url: '/api/v1/areas/1', corpo: null }),
    )
    expect(await screen.findByText('Área excluída')).toBeInTheDocument()
  })

  it('(c) 409 ao excluir área em uso mostra a mensagem do servidor', async () => {
    montar({
      ...listaPadrao,
      'DELETE /areas/1': () =>
        json({ erro: { codigo: 'REGISTRO_EM_USO', mensagem: 'A área está em uso e não pode ser excluída.' } }, 409),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Financeiro' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('A área está em uso e não pode ser excluída.')).toBeInTheDocument()
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar({
      ...listaPadrao,
      'POST /areas': () =>
        json(
          {
            erro: {
              codigo: 'VALIDACAO',
              mensagem: 'Dados inválidos.',
              detalhes: [{ campo: 'nome', mensagem: 'Nome inválido.' }],
            },
          },
          400,
        ),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Nova área/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Jurídico' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Nome inválido.')).toBeInTheDocument()
  })

  it('(c) 409 em nome duplicado aparece no campo', async () => {
    montar({
      ...listaPadrao,
      'POST /areas': () =>
        json(
          {
            erro: {
              codigo: 'CONFLITO',
              mensagem: 'Já existe.',
              detalhes: [{ campo: 'nome', mensagem: 'Já existe uma área com este nome.' }],
            },
          },
          409,
        ),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Nova área/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Financeiro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Já existe uma área com este nome.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar({ 'GET /areas': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status), 'GET /meta': meta })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })

  it('/admin com USUARIO vai para /sem-permissao', async () => {
    const r = renderRota('/admin', { sessao: sessaoDe('USUARIO'), respostas: {} })
    falsaAtual = r.falsa
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/sem-permissao'))
  })

  it('/admin com ADMIN vai para /admin/usuarios', async () => {
    const r = renderRota('/admin', { sessao: sessaoDe('ADMIN'), respostas: {} })
    falsaAtual = r.falsa
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/admin/usuarios'))
  })
})
