import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

const usuario: UsuarioMe = {
  id: 7,
  nome: 'Ana Souza',
  login: 'ana',
  email: null,
  telefone: null,
  perfil: 'USUARIO',
  areaId: null,
  areaIds: [],
  permissoes: [],
  mfaAtivo: false,
  deveTrocarSenha: false,
  tema: 'SISTEMA',
  densidade: null,
  enviarComEnter: true,
}
const sessao = (estado: SessaoResposta['estado']): SessaoResposta => ({
  estado,
  csrf: 'csrf-novo',
  usuario: estado === 'ATIVA' ? usuario : null,
})
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function montar(respostas: Parameters<typeof renderRota>[1]['respostas']) {
  const r = renderRota('/trocar-senha', { sessao: sessao('TROCA_SENHA'), respostas })
  falsaAtual = r.falsa
  return r
}

async function preencher(atual = 'Antiga-123', nova = 'Cavalo-Bateria-Grampo-2026', repete = nova) {
  fireEvent.change(await screen.findByLabelText(/^Senha atual/), { target: { value: atual } })
  fireEvent.change(screen.getByLabelText(/^Nova senha/), { target: { value: nova } })
  fireEvent.change(screen.getByLabelText(/^Repita a nova senha/), { target: { value: repete } })
}
const enviar = () => fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }))

describe('/trocar-senha', () => {
  it('(a) renderiza o formulário com o medidor de força', async () => {
    montar({})
    expect(await screen.findByRole('heading', { name: 'Troque a sua senha' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Senha atual/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Nova senha/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Repita a nova senha/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trocar senha' })).toBeEnabled()
  })

  it('(b) POST /auth/trocar-senha com { senhaAtual, novaSenha } e vai para /configurar-2fa', async () => {
    const { falsa, router, queryClient } = montar({ 'POST /auth/trocar-senha': () => json(sessao('CADASTRO_MFA')) })
    await preencher()
    enviar()
    await waitFor(() => expect(router.state.location.pathname).toBe('/configurar-2fa'))
    expect(falsa.chamadas).toContainEqual({
      metodo: 'POST',
      url: '/api/v1/auth/trocar-senha',
      corpo: { senhaAtual: 'Antiga-123', novaSenha: 'Cavalo-Bateria-Grampo-2026' },
    })
    expect(queryClient.getQueryData(['auth', 'sessao'])).toMatchObject({ estado: 'CADASTRO_MFA', csrf: 'csrf-novo' })
  })

  it('sessão ATIVA depois da troca (USUARIO sem 2FA) vai para / e a guarda leva a /chamados', async () => {
    const { router } = montar({ 'POST /auth/trocar-senha': () => json(sessao('ATIVA')) })
    await preencher()
    enviar()
    await waitFor(() => expect(router.state.location.pathname).toBe('/chamados'))
  })

  it('a confirmação diferente da nova senha bloqueia o envio', async () => {
    const { falsa } = montar({})
    await preencher('Antiga-123', 'Cavalo-Bateria-Grampo-2026', 'outra coisa')
    enviar()
    expect(await screen.findByText('As senhas não conferem.')).toBeInTheDocument()
    expect(falsa.chamadas).toEqual([])
  })

  it('(c) 400 com detalhes aparece no campo', async () => {
    montar({
      'POST /auth/trocar-senha': () =>
        json(
          {
            erro: {
              codigo: 'VALIDACAO',
              mensagem: 'Dados inválidos.',
              detalhes: [{ campo: 'novaSenha', mensagem: 'A senha é fraca.' }],
            },
          },
          400,
        ),
    })
    await preencher()
    enviar()
    expect(await screen.findByText('A senha é fraca.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Nova senha/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('campos vazios mostram os erros e não chamam a API', async () => {
    const { falsa } = montar({})
    fireEvent.click(await screen.findByRole('button', { name: 'Trocar senha' }))
    expect(await screen.findByText('Informe a senha atual.')).toBeInTheDocument()
    expect(falsa.chamadas).toEqual([])
  })

  it('sem sessão, a rota manda para /login', async () => {
    const r = renderRota('/trocar-senha', { sessao: sessao('TROCA_SENHA'), respostas: {} })
    falsaAtual = r.falsa
    r.queryClient.setQueryData(['auth', 'sessao'], null)
    await r.router.navigate({ to: '/trocar-senha' })
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/login'))
  })
})
