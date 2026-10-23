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

const tipo = (id: number, nome: string, ativo = true) => ({ id, nome, ativo })

const pagina = (itens: unknown[]) => ({ itens, total: itens.length, pagina: 1, porPagina: 20 })

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(respostas: Parameters<typeof renderRota>[1]['respostas'], perfil: UsuarioMe['perfil'] = 'ADMIN') {
  const r = renderRota('/admin/tipos-ativo', { sessao: sessaoDe(perfil), respostas })
  falsaAtual = r.falsa
  return r
}

const listaPadrao = {
  'GET /tipos-ativo': pagina([tipo(1, 'Notebook'), tipo(2, 'Impressora', false)]),
}

describe('/admin/tipos-ativo', () => {
  it('(a) lista os tipos com a situação', async () => {
    montar(listaPadrao)
    expect(await screen.findByText('Notebook')).toBeInTheDocument()
    const linha = screen.getByText('Impressora').closest('tr')
    expect(linha).not.toBeNull()
    if (linha) {
      expect(within(linha).getByText('Inativo')).toBeInTheDocument()
    }
  })

  it('(b) criar faz POST /tipos-ativo com o body esperado', async () => {
    const { falsa } = montar({ ...listaPadrao, 'POST /tipos-ativo': () => json(tipo(3, 'Monitor'), 201) })
    fireEvent.click(await screen.findByRole('button', { name: /Novo tipo/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Monitor' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/tipos-ativo',
        corpo: { nome: 'Monitor', ativo: true },
      }),
    )
    expect(await screen.findByText('Tipo de ativo criado')).toBeInTheDocument()
  })

  it('(b) editar faz PATCH /tipos-ativo/:id com o body esperado', async () => {
    const { falsa } = montar({ ...listaPadrao, 'PATCH /tipos-ativo/1': () => json(tipo(1, 'Notebook Gamer')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Notebook' }))
    const campo = await screen.findByLabelText(/^Nome/)
    expect(campo).toHaveValue('Notebook')
    fireEvent.change(campo, { target: { value: 'Notebook Gamer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/tipos-ativo/1',
        corpo: { nome: 'Notebook Gamer', ativo: true },
      }),
    )
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar({
      ...listaPadrao,
      'POST /tipos-ativo': () =>
        json(
          {
            erro: {
              codigo: 'VALIDACAO',
              mensagem: 'Dados inválidos.',
              detalhes: [{ campo: 'nome', mensagem: 'Use no máximo 80 caracteres.' }],
            },
          },
          400,
        ),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Novo tipo/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Monitor' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Use no máximo 80 caracteres.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar({ 'GET /tipos-ativo': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status) })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
