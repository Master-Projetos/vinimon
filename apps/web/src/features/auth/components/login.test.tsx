import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { SessaoResposta } from '@vinimon/shared'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

const semSessao: SessaoResposta = { estado: 'PENDENTE_MFA', csrf: 'x', usuario: null }
const usuario = {
  id: 1,
  nome: 'Ana',
  login: 'ana',
  email: null,
  telefone: null,
  perfil: 'USUARIO' as const,
  areaId: null,
  areaIds: [],
  permissoes: [],
  mfaAtivo: false,
  deveTrocarSenha: false,
  tema: 'SISTEMA' as const,
  densidade: null,
  enviarComEnter: true,
}
const sessao = (estado: SessaoResposta['estado']): SessaoResposta => ({
  estado,
  csrf: 'csrf-novo',
  usuario: estado === 'ATIVA' ? usuario : null,
})

const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } })

let falsaAtual: ApiFalsa | undefined

// o jsdom não implementa `elementFromPoint`, que o `input-otp` usa ao focar
beforeAll(() => {
  if (typeof document.elementFromPoint !== 'function') document.elementFromPoint = () => null
})
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(caminho: string, respostas: Parameters<typeof renderRota>[1]['respostas']) {
  const r = renderRota(caminho, { sessao: semSessao, respostas })
  falsaAtual = r.falsa
  return r
}

async function preencher(login = 'Ana', senha = 'segredo') {
  fireEvent.change(await screen.findByLabelText(/^Login/), { target: { value: login } })
  fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: senha } })
}
const entrar = () => fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

describe('/login', () => {
  it('(a) renderiza o formulário', async () => {
    montar('/login', {})
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Login/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Senha/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })

  it('(b) POST /auth/login com { login, senha } e, em ATIVA, navega para o redirect', async () => {
    const { falsa, router, queryClient } = montar('/login?redirect=%2Fchamados', {
      'POST /auth/login': () => json(sessao('ATIVA')),
    })
    await preencher('  ANA ', 'segredo')
    entrar()
    await waitFor(() => expect(router.state.location.pathname).toBe('/chamados'))
    expect(falsa.chamadas).toContainEqual({
      metodo: 'POST',
      url: '/api/v1/auth/login',
      corpo: { login: 'ana', senha: 'segredo' }, // o login sai normalizado pelo contrato
    })
    expect(queryClient.getQueryData(['auth', 'sessao'])).toMatchObject({ estado: 'ATIVA', csrf: 'csrf-novo' })
  })

  it('sem redirect (ou com redirect externo) vai para / e a guarda leva USUARIO a /chamados', async () => {
    const { router } = montar('/login?redirect=%2F%2Fevil.example', { 'POST /auth/login': () => json(sessao('ATIVA')) })
    await preencher()
    entrar()
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/login'))
    expect(router.state.location.pathname).toBe('/chamados')
  })

  it.each([
    ['TROCA_SENHA', '/trocar-senha'],
    ['CADASTRO_MFA', '/configurar-2fa'],
  ] as const)('estado %s vai para %s', async (estado, destino) => {
    const { router } = montar('/login', { 'POST /auth/login': () => json(sessao(estado)) })
    await preencher()
    entrar()
    await waitFor(() => expect(router.state.location.pathname).toBe(destino))
  })

  it('(b) PENDENTE_MFA mostra a etapa de 2FA; o código vai para /auth/2fa/verificar e segue ao destino', async () => {
    const { falsa, router } = montar('/login?redirect=%2Fchamados', {
      'POST /auth/login': () => json(sessao('PENDENTE_MFA')),
      'POST /auth/2fa/verificar': () => json(sessao('ATIVA')),
    })
    await preencher()
    entrar()
    expect(await screen.findByRole('heading', { name: 'Verificação em duas etapas' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')

    const campo = screen.getByLabelText('Código de 6 dígitos')
    fireEvent.change(campo, { target: { value: '123456' } })
    await waitFor(() => expect(router.state.location.pathname).toBe('/chamados'))
    expect(falsa.chamadas).toContainEqual({
      metodo: 'POST',
      url: '/api/v1/auth/2fa/verificar',
      corpo: { codigo: '123456' },
    })
  })

  it('2FA: código inválido mostra o erro e deixa tentar de novo; o código de recuperação tem campo próprio', async () => {
    const { falsa } = montar('/login', {
      'POST /auth/login': () => json(sessao('PENDENTE_MFA')),
      'POST /auth/2fa/verificar': () =>
        json({ erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Código inválido.' } }, 401),
    })
    await preencher()
    entrar()
    await screen.findByRole('heading', { name: 'Verificação em duas etapas' })
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '000000' } })
    expect(await screen.findByText('Código inválido.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Usar um código de recuperação' }))
    fireEvent.change(screen.getByLabelText('Código de recuperação'), { target: { value: 'ABCD-1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }))
    await waitFor(() =>
      expect(falsa.chamadas).toContainEqual({
        metodo: 'POST',
        url: '/api/v1/auth/2fa/verificar',
        corpo: { codigoRecuperacao: 'ABCD-1234' },
      }),
    )
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar('/login', {
      'POST /auth/login': () =>
        json(
          {
            erro: {
              codigo: 'VALIDACAO',
              mensagem: 'Dados inválidos.',
              detalhes: [{ campo: 'login', mensagem: 'Login inválido.' }],
            },
          },
          400,
        ),
    })
    await preencher()
    entrar()
    expect(await screen.findByText('Login inválido.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Login/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('401 mostra uma mensagem única, sem dizer o que falhou', async () => {
    montar('/login', {
      'POST /auth/login': () =>
        json({ erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Login ou senha inválidos.' } }, 401),
    })
    await preencher()
    entrar()
    expect(await screen.findByRole('alert')).toHaveTextContent('Login ou senha inválidos.')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })

  it('(d) 429 desabilita o botão com contagem regressiva a partir do Retry-After', async () => {
    montar('/login', {
      'POST /auth/login': () =>
        json({ erro: { codigo: 'MUITAS_TENTATIVAS', mensagem: 'Muitas tentativas.' } }, 429, { 'retry-after': '30' }),
    })
    await preencher()
    entrar()
    const botao = await screen.findByRole('button', { name: /Aguarde 30s/ })
    expect(botao).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Muitas tentativas')
    await waitFor(() => expect(screen.getByRole('button', { name: /Aguarde (29|28)s/ })).toBeDisabled(), {
      timeout: 3000,
    })
  })

  it('429 sem Retry-After usa 60 s', async () => {
    montar('/login', {
      'POST /auth/login': () => json({ erro: { codigo: 'MUITAS_TENTATIVAS', mensagem: 'x' } }, 429),
    })
    await preencher()
    entrar()
    expect(await screen.findByRole('button', { name: /Aguarde 60s/ })).toBeDisabled()
  })

  it('avisa quando o Caps Lock está ligado na senha', async () => {
    montar('/login', {})
    const senha = await screen.findByLabelText(/^Senha/)
    fireEvent.keyDown(senha, { key: 'A', modifierCapsLock: true })
    expect(await screen.findByText('Caps Lock está ligado.')).toBeInTheDocument()
    fireEvent.keyDown(senha, { key: 'a', modifierCapsLock: false })
    await waitFor(() => expect(screen.queryByText('Caps Lock está ligado.')).not.toBeInTheDocument())
  })

  it('campos vazios mostram os erros e não chamam a API', async () => {
    const { falsa } = montar('/login', {})
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Informe o login.')).toBeInTheDocument()
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument()
    expect(falsa.chamadas).toEqual([])
  })
})
