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

const categoria = (id: number, nome: string, ordem: number, ativo = true) => ({ id, nome, ordem, ativo })

const pagina = (itens: unknown[]) => ({ itens, total: itens.length, pagina: 1, porPagina: 20 })

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(respostas: Parameters<typeof renderRota>[1]['respostas'], perfil: UsuarioMe['perfil'] = 'ADMIN') {
  const r = renderRota('/admin/categorias-artigo', { sessao: sessaoDe(perfil), respostas })
  falsaAtual = r.falsa
  return r
}

const listaPadrao = {
  'GET /categorias-artigo': pagina([categoria(1, 'Tutoriais', 10), categoria(2, 'Antigos', 99, false)]),
}

describe('/admin/categorias-artigo', () => {
  it('(a) lista as categorias com ordem e situação', async () => {
    montar(listaPadrao)
    expect(await screen.findByText('Tutoriais')).toBeInTheDocument()
    const linha = screen.getByText('Antigos').closest('tr')
    expect(linha).not.toBeNull()
    if (linha) {
      expect(within(linha).getByText('99')).toBeInTheDocument()
      expect(within(linha).getByText('Inativa')).toBeInTheDocument()
    }
  })

  it('(b) criar faz POST /categorias-artigo com o body esperado', async () => {
    const { falsa } = montar({
      ...listaPadrao,
      'POST /categorias-artigo': () => json(categoria(3, 'Dicas', 0), 201),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Nova categoria/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Dicas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/categorias-artigo',
        corpo: { nome: 'Dicas', ordem: 0, ativo: true },
      }),
    )
    expect(await screen.findByText('Categoria criada')).toBeInTheDocument()
  })

  it('(b) editar faz PATCH /categorias-artigo/:id com o body esperado', async () => {
    const { falsa } = montar({
      ...listaPadrao,
      'PATCH /categorias-artigo/1': () => json(categoria(1, 'Tutoriais', 20)),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Tutoriais' }))
    const ordem = await screen.findByLabelText(/^Ordem/)
    expect(ordem).toHaveValue(10)
    fireEvent.change(ordem, { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PATCH',
        url: '/api/v1/categorias-artigo/1',
        corpo: { nome: 'Tutoriais', ordem: 20, ativo: true },
      }),
    )
  })

  it('(b) excluir confirma e faz DELETE /categorias-artigo/:id', async () => {
    const { falsa } = montar({ ...listaPadrao, 'DELETE /categorias-artigo/1': () => new Response(null, { status: 204 }) })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Tutoriais' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({ metodo: 'DELETE', url: '/api/v1/categorias-artigo/1', corpo: null }),
    )
    expect(await screen.findByText('Categoria excluída')).toBeInTheDocument()
  })

  it('(c) 409 ao excluir mostra a mensagem do servidor', async () => {
    montar({
      ...listaPadrao,
      'DELETE /categorias-artigo/1': () =>
        json({ erro: { codigo: 'REGISTRO_EM_USO', mensagem: 'Registro em uso e não pode ser excluído.' } }, 409),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Tutoriais' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    expect(await screen.findByText('Registro em uso e não pode ser excluído.')).toBeInTheDocument()
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar({
      ...listaPadrao,
      'POST /categorias-artigo': () =>
        json(
          {
            erro: {
              codigo: 'VALIDACAO',
              mensagem: 'Dados inválidos.',
              detalhes: [{ campo: 'ordem', mensagem: 'Use um valor entre 0 e 1000.' }],
            },
          },
          400,
        ),
    })
    fireEvent.click(await screen.findByRole('button', { name: /Nova categoria/ }))
    fireEvent.change(await screen.findByLabelText(/^Nome/), { target: { value: 'Dicas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Use um valor entre 0 e 1000.')).toBeInTheDocument()
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar({ 'GET /categorias-artigo': () => json({ erro: { codigo: 'ERRO', mensagem: 'Negado.' } }, status) })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })
})
