import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRota } from '@/test/render-rota'

// Radix (Dialog, Popper) usa ResizeObserver, que o jsdom não tem.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let restaurar: (() => void) | null = null
afterEach(() => {
  cleanup()
  restaurar?.()
  restaurar = null
})

function sessaoDe(perfil: UsuarioMe['perfil'], mfaAtivo = true): SessaoResposta {
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
    mfaAtivo,
    deveTrocarSenha: false,
    tema: 'SISTEMA',
    densidade: null,
    enviarComEnter: true,
  }
  return { estado: 'ATIVA', csrf: 'csrf-teste', usuario }
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

function montar(perfil: UsuarioMe['perfil'], respostas: Record<string, unknown> = {}, mfaAtivo = true) {
  const r = renderRota('/perfil/seguranca', { sessao: sessaoDe(perfil, mfaAtivo), respostas })
  restaurar = r.falsa.restaurar
  return r
}

describe('/perfil/seguranca', () => {
  it('trocar senha envia o body esperado e avisa que as outras sessões foram encerradas', async () => {
    const { falsa } = montar('OPERADOR', { 'POST /auth/trocar-senha': sessaoDe('OPERADOR') })
    fireEvent.change(await screen.findByLabelText(/Senha atual/), { target: { value: 'Antiga#12345' } })
    fireEvent.change(screen.getByLabelText(/^Nova senha/), { target: { value: 'Nova#Senha-9876' } })
    fireEvent.change(screen.getByLabelText(/Repita a nova senha/), { target: { value: 'Nova#Senha-9876' } })
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }))
    await waitFor(() => expect(falsa.chamadas.some((c) => c.url === '/api/v1/auth/trocar-senha')).toBe(true))
    expect(falsa.chamadas.find((c) => c.url === '/api/v1/auth/trocar-senha')?.corpo).toEqual({
      senhaAtual: 'Antiga#12345',
      novaSenha: 'Nova#Senha-9876',
    })
    expect(await screen.findByText('Senha alterada. As outras sessões foram encerradas.')).toBeInTheDocument()
  })

  it('400 com detalhes aparece no campo', async () => {
    montar('OPERADOR', {
      'POST /auth/trocar-senha': () =>
        json(
          {
            erro: {
              codigo: 'VALIDACAO',
              mensagem: 'Dados inválidos.',
              detalhes: [{ campo: 'novaSenha', mensagem: 'A senha é fraca demais.' }],
            },
          },
          400,
        ),
    })
    fireEvent.change(await screen.findByLabelText(/Senha atual/), { target: { value: 'Antiga#12345' } })
    fireEvent.change(screen.getByLabelText(/^Nova senha/), { target: { value: 'fraca' } })
    fireEvent.change(screen.getByLabelText(/Repita a nova senha/), { target: { value: 'fraca' } })
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }))
    expect(await screen.findByText('A senha é fraca demais.')).toBeInTheDocument()
  })

  it('"Gerar novos códigos" pede a senha e mostra os códigos devolvidos', async () => {
    const { falsa } = montar('OPERADOR', { 'POST /auth/2fa/codigos': { codigos: ['AAAA-1111', 'BBBB-2222'] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar novos códigos' }))
    fireEvent.change(await screen.findByLabelText('Senha'), { target: { value: 'Minha#Senha1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar códigos' }))
    expect(await screen.findByText('AAAA-1111')).toBeInTheDocument()
    expect(falsa.chamadas.find((c) => c.url === '/api/v1/auth/2fa/codigos')?.corpo).toEqual({ senha: 'Minha#Senha1' })
  })

  it('"Desativar" só aparece para USUARIO e envia senha e código', async () => {
    montar('OPERADOR')
    await screen.findByRole('button', { name: 'Gerar novos códigos' })
    expect(screen.queryByRole('button', { name: 'Desativar' })).not.toBeInTheDocument()
    cleanup()
    restaurar?.()
    const { falsa } = montar('USUARIO', {
      'POST /auth/2fa/desativar': () => new Response(null, { status: 204 }),
      'GET /auth/sessao': sessaoDe('USUARIO', false),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }))
    fireEvent.change(await screen.findByLabelText('Senha'), { target: { value: 'Minha#Senha1' } })
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '123456' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Desativar' }).at(-1) as HTMLElement)
    await waitFor(() => expect(falsa.chamadas.some((c) => c.url === '/api/v1/auth/2fa/desativar')).toBe(true))
    expect(falsa.chamadas.find((c) => c.url === '/api/v1/auth/2fa/desativar')?.corpo).toEqual({
      senha: 'Minha#Senha1',
      codigo: '123456',
    })
  })
})
