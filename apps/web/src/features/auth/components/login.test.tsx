import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { SessaoResposta } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

const deslogado: SessaoResposta = { estado: 'PENDENTE_MFA', csrf: '', usuario: null }

let falsaAtual: ApiFalsa | undefined

afterEach(() => {
  falsaAtual?.restaurar()
  falsaAtual = undefined
  cleanup()
})

async function preencherEEnviar(login: string, senha: string) {
  fireEvent.change(await screen.findByLabelText(/^Login/), { target: { value: login } })
  fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: senha } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('tela de login', () => {
  it('renderiza o formulário com login, senha e botão Entrar', async () => {
    const { falsa } = renderRota('/login', { sessao: deslogado, respostas: {} })
    falsaAtual = falsa

    expect(await screen.findByLabelText(/^Login/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Senha/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })

  it('envia POST /auth/login com { login, senha } e, em ATIVA, navega para o redirect', async () => {
    const { falsa, router } = renderRota('/login?redirect=/atividade', {
      sessao: deslogado,
      respostas: { 'POST /auth/login': { estado: 'ATIVA', csrf: 'csrf-novo', usuario: null } },
    })
    falsaAtual = falsa

    await preencherEEnviar('ana', 'segredo')

    await waitFor(() => expect(router.state.location.pathname).toBe('/atividade'))
    const envio = falsa.chamadas.find((c) => c.metodo === 'POST' && c.url === '/api/v1/auth/login')
    expect(envio?.corpo).toEqual({ login: 'ana', senha: 'segredo' })
  })

  it('em PENDENTE_MFA mostra a etapa de verificação em duas etapas', async () => {
    const { falsa } = renderRota('/login', {
      sessao: deslogado,
      respostas: { 'POST /auth/login': { estado: 'PENDENTE_MFA', csrf: 'csrf-parcial', usuario: null } },
    })
    falsaAtual = falsa

    await preencherEEnviar('ana', 'segredo')

    expect(await screen.findByRole('heading', { name: 'Verificação em duas etapas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeInTheDocument()
  })

  it('400 com detalhes aparece no campo', async () => {
    const { falsa } = renderRota('/login', {
      sessao: deslogado,
      respostas: {
        'POST /auth/login': () =>
          new Response(
            JSON.stringify({
              erro: {
                codigo: 'VALIDACAO',
                mensagem: 'Dados inválidos.',
                detalhes: [{ campo: 'login', mensagem: 'Login não encontrado.' }],
              },
            }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          ),
      },
    })
    falsaAtual = falsa

    await preencherEEnviar('ana', 'segredo')

    expect(await screen.findByText('Login não encontrado.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Login/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('429 desabilita o botão e mostra a contagem regressiva', async () => {
    const { falsa } = renderRota('/login', {
      sessao: deslogado,
      respostas: {
        'POST /auth/login': () =>
          new Response(JSON.stringify({ erro: { codigo: 'MUITAS_TENTATIVAS', mensagem: 'Muitas tentativas.' } }), {
            status: 429,
            headers: { 'content-type': 'application/json', 'retry-after': '30' },
          }),
      },
    })
    falsaAtual = falsa

    await preencherEEnviar('ana', 'segredo')

    expect(await screen.findByText(/Muitas tentativas\. Tente novamente em \d+ s\./)).toBeInTheDocument()
    const botao = screen.getByRole('button', { name: /Aguarde \d+ s/ })
    expect(botao).toBeDisabled()
  })
})
