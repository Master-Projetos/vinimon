import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { SessaoResposta, UsuarioMe } from '@vinimon/shared'
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

const tag = (id: number, nome: string, ativo = true) => ({
  id,
  nome,
  ativo,
  criadoEm: '2026-10-01T10:00:00.000Z',
})

const pagina = (itens: unknown[]) => ({ itens, total: itens.length, pagina: 1, porPagina: 20 })

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(respostas: Parameters<typeof renderRota>[1]['respostas'], perfil: UsuarioMe['perfil'] = 'ADMIN') {
  const r = renderRota('/admin/tags', { sessao: sessaoDe(perfil), respostas })
  falsaAtual = r.falsa
  return r
}

const listaPadrao = {
  'GET /tags': pagina([tag(1, 'urgente'), tag(2, 'legado', false)]),
}

describe('/admin/tags', () => {
  it('(a) lista as tags com a situação', async () => {
    montar(listaPadrao)
    expect(await screen.findByText('urgente')).toBeInTheDocument()
    const linha = screen.getByText('legado').closest('tr')
    expect(linha).not.toBeNull()
    if (linha) {
      expect(within(linha).getByText('Inativa')).toBeInTheDocument()
    }
  })

  it('(b) criar faz POST /tags com o body esperado', async () => {
    const { falsa } = montar({ ...listaPadrao, 'POST /tags': () => json(tag(3, 'cliente-vip'), 201) })
    fireEvent.click(await screen.findByRole('button', { name: /Nova tag/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'cliente-vip' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/tags',
        corpo: { nome: 'cliente-vip', ativo: true },
      }),
    )
    expect(await screen.findByText('Tag criada')).toBeInTheDocument()
  })

  it('(b) editar faz PATCH /tags/:id com o body esperado', async () => {
    const { falsa } = montar({ ...listaPadrao, 'PATCH /tags/1': () => json(tag(1, 'urgentissimo')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar urgente' }))
    const campo = await screen.findByLabelText(/^Nome/)
    expect(campo).toHaveValue('urgente')
    fireEvent.change(campo, { target: { value: 'urgentissimo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/tags/1',
        corpo: { nome: 'urgentissimo', ativo: true },
      }),
    )
  })

  it('(b) excluir confirma e faz DELETE /tags/:id', async () => {
    const { falsa } = montar({ ...listaPadrao, 'DELETE /tags/1': () => new Response(null, { status: 204 }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir urgente' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(falsa.chamadas).toContainEqual({ metodo: 'DELETE', url: '/api/v1/tags/1', corpo: null }))
    expect(await screen.findByText('Tag excluída')).toBeInTheDocument()
  })

  it('(c) 409 ao excluir mostra a mensagem do servidor', async () => {
    montar({
      ...listaPadrao,
      'DELETE /tags/1': () =>
        json({ erro: { codigo: 'REGISTRO_EM_USO', mensagem: 'Registro em uso e não pode ser excluído.' } }, 409),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir urgente' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('Registro em uso e não pode ser excluído.')).toBeInTheDocument()
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar({
      ...listaPadrao,
      'POST /tags': () =>
        json(
          {
            erro: {
              codigo: 'VALIDACAO',
              mensagem: 'Dados inválidos.',
              detalhes: [{ campo: 'nome', mensagem: 'Informe a tag.' }],
            },
          },
          400,
        ),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Nova tag/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Informe a tag.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar({ 'GET /tags': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status) })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
