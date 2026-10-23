import { cleanup, screen, waitFor } from '@testing-library/react'
import type { SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRota } from '@/test/render-rota'

afterEach(() => {
  cleanup()
})

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
    mfaAtivo: perfil !== 'USUARIO',
    deveTrocarSenha: false,
    tema: 'SISTEMA',
    densidade: null,
    enviarComEnter: true,
  }
  return { estado: 'ATIVA', csrf: 'csrf-teste', usuario }
}

describe('/ (redirecionamento inicial)', () => {
  it('ADMIN em / vai para /atividade', async () => {
    const { router } = renderRota('/', { sessao: sessaoDe('ADMIN'), respostas: {} })
    await waitFor(() => expect(router.state.location.pathname).toBe('/atividade'))
    expect(await screen.findByRole('navigation', { name: 'Aplicativos' })).toBeInTheDocument()
  })

  it('OPERADOR em / vai para /atividade', async () => {
    const { router } = renderRota('/', { sessao: sessaoDe('OPERADOR'), respostas: {} })
    await waitFor(() => expect(router.state.location.pathname).toBe('/atividade'))
  })

  it('USUARIO em / vai para /chamados', async () => {
    const { router } = renderRota('/', { sessao: sessaoDe('USUARIO'), respostas: {} })
    await waitFor(() => expect(router.state.location.pathname).toBe('/chamados'))
  })
})
