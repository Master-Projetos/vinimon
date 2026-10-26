import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApiFalsa } from '@/test/api-falsa'
import { renderRota } from '@/test/render-rota'

// Radix (Dialog, Popper) e cmdk usam APIs que o jsdom não tem.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
Element.prototype.scrollIntoView = () => {}
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = () => {}

let falsaAtual: ApiFalsa | undefined
afterEach(() => {
  cleanup()
  falsaAtual?.restaurar()
  falsaAtual = undefined
})

function sessao(): SessaoResposta {
  const usuario: UsuarioMe = {
    id: 7,
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
  return { estado: 'ATIVA', csrf: 'csrf', usuario }
}

const montar = async () => {
  const r = renderRota('/painel', { sessao: sessao(), respostas: {} })
  falsaAtual = r.falsa
  await screen.findByRole('button', { name: /Pesquisar chamados/ })
  return r
}

const ctrlK = () => fireEvent.keyDown(document, { key: 'k', ctrlKey: true })

describe('busca e atalhos', () => {
  it('Ctrl+K abre a paleta e "125" mostra "Abrir #125"', async () => {
    await montar()
    ctrlK()
    const campo = await screen.findByPlaceholderText(/Pesquisar chamados/)
    fireEvent.change(campo, { target: { value: '125' } })
    expect(await screen.findByText('Abrir #125')).toBeInTheDocument()
  })

  it('"g c" navega para Chamados', async () => {
    const { router } = await montar()
    fireEvent.keyDown(document.body, { key: 'g' })
    fireEvent.keyDown(document.body, { key: 'c' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/chamados'))
  })

  it('atalho de letra com foco em input é ignorado', async () => {
    const { router } = await montar()
    const campo = document.createElement('input')
    document.body.append(campo)
    campo.focus()
    fireEvent.keyDown(campo, { key: 'g' })
    fireEvent.keyDown(campo, { key: 'c' })
    await new Promise((r) => setTimeout(r, 50))
    expect(router.state.location.pathname).toBe('/painel')
    campo.remove()
  })

  it('Ctrl+K funciona mesmo dentro de um campo e "?" abre os atalhos', async () => {
    await montar()
    const campo = document.createElement('input')
    document.body.append(campo)
    campo.focus()
    fireEvent.keyDown(campo, { key: 'k', ctrlKey: true })
    expect(await screen.findByPlaceholderText(/Pesquisar chamados/)).toBeInTheDocument()
    campo.remove()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByPlaceholderText(/Pesquisar chamados/)).not.toBeInTheDocument())
    fireEvent.keyDown(document.body, { key: '?' })
    expect(await screen.findByRole('heading', { name: 'Atalhos de teclado' })).toBeInTheDocument()
  })
})
