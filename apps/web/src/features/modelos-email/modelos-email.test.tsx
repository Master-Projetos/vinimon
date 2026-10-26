import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
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

const usuario: UsuarioMe = {
  id: 1,
  nome: 'Ana Souza',
  login: 'ana',
  email: null,
  telefone: null,
  perfil: 'ADMIN',
  areaId: null,
  areaIds: [],
  permissoes: [],
  mfaAtivo: true,
  deveTrocarSenha: false,
  tema: 'SISTEMA',
  densidade: null,
  enviarComEnter: true,
}
const sessao: SessaoResposta = { estado: 'ATIVA', csrf: 'csrf-teste', usuario }

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

const erro = (status: number, codigo: string, mensagem: string, detalhes: { campo: string; mensagem: string }[] = []) =>
  json({ erro: { codigo, mensagem, detalhes } }, status)

const modelo = (evento: string, assunto: string, ativo: boolean) => ({
  evento,
  assunto,
  corpoTexto: `Corpo de ${evento}`,
  ativo,
  atualizadoEm: '2026-10-01T12:00:00.000Z',
})

const lista = {
  'GET /modelos-email': [
    modelo('abertura', 'Chamado #{{numero}} aberto', true),
    modelo('recuperar_senha', 'Redefinição de senha', false),
  ],
}

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(respostas: Parameters<typeof renderRota>[1]['respostas']) {
  const r = renderRota('/admin/modelos-email', { sessao, respostas })
  falsaAtual = r.falsa
  return r
}

const editar = async (rotulo: string) =>
  fireEvent.click(await screen.findByRole('button', { name: `Editar modelo ${rotulo}` }))

describe('/admin/modelos-email', () => {
  it('(a) lista os modelos com evento, assunto e situação', async () => {
    montar(lista)
    expect(await screen.findByText('Abertura de chamado')).toBeInTheDocument()
    expect(screen.getByText('Chamado #{{numero}} aberto')).toBeInTheDocument()
    expect(screen.getByText('Recuperação de senha')).toBeInTheDocument()
    expect(screen.getByText('Inativo')).toBeInTheDocument()
  })

  it('(a) o editor mostra a lista das variáveis do modelo', async () => {
    montar(lista)
    await editar('Abertura de chamado')
    expect(await screen.findByRole('heading', { name: 'Abertura de chamado' })).toBeInTheDocument()
    for (const variavel of ['{{numero}}', '{{assunto}}', '{{solicitante}}', '{{link}}', '{{sistema}}']) {
      expect(screen.getByText(variavel)).toBeInTheDocument()
    }
  })

  it('(b) salvar envia PUT /modelos-email/:evento com o body esperado', async () => {
    const { falsa } = montar({
      ...lista,
      'PUT /modelos-email/abertura': modelo('abertura', 'Novo assunto', true),
    })
    await editar('Abertura de chamado')
    fireEvent.change(await screen.findByLabelText(/^Assunto/), { target: { value: 'Novo assunto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'PUT',
        url: '/api/v1/modelos-email/abertura',
        corpo: { assunto: 'Novo assunto', corpoTexto: 'Corpo de abertura', ativo: true },
      }),
    )
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar({
      ...lista,
      'PUT /modelos-email/abertura': () =>
        erro(400, 'VALIDACAO', 'Dados inválidos.', [{ campo: 'corpoTexto', mensagem: 'Corpo acima do limite.' }]),
    })
    await editar('Abertura de chamado')
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Corpo acima do limite.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Corpo/)).toHaveAttribute('aria-invalid', 'true')
  })

  it.each([
    [403, 'Você não tem acesso a este conteúdo'],
    [404, 'Não encontrado'],
  ] as const)('(d) %i ao listar mostra o ErrorState', async (status, titulo) => {
    montar({ 'GET /modelos-email': () => erro(status, 'ERRO', 'Negado.') })
    expect(await screen.findByText(titulo)).toBeInTheDocument()
  })

  it('enviar teste chama POST /modelos-email/teste com o destino', async () => {
    const { falsa } = montar({
      ...lista,
      'POST /modelos-email/teste': { id: 42 },
    })
    await editar('Abertura de chamado')
    fireEvent.change(await screen.findByLabelText(/^Para/), { target: { value: 'ana@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar teste' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/modelos-email/teste',
        corpo: { para: 'ana@example.com' },
      }),
    )
  })
})
