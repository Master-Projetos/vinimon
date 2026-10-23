import { QueryClient } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { Inbox } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'
import { ErroApi } from '@/lib/api'
import { criarRouter } from '@/router'
import { ConfirmDialog } from './confirm-dialog'
import { EmptyState } from './empty-state'
import { ErrorState } from './error-state'
import { NotFoundState } from './not-found-state'

afterEach(() => {
  cleanup()
})

function erroApi(status: number, requestId?: string) {
  return new ErroApi(status, {
    erro: { codigo: 'INTERNO', mensagem: 'Falha interna.', ...(requestId ? { requestId } : {}) },
  })
}

describe('ErrorState', () => {
  it('mostra o requestId do erro', () => {
    render(<ErrorState erro={erroApi(500, 'req-abc123')} />)
    expect(screen.getByText('req-abc123')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar código para o suporte' })).toBeInTheDocument()
  })

  it('mensagem por status', () => {
    render(<ErrorState erro={erroApi(403)} />)
    expect(screen.getByText('Você não tem acesso a este conteúdo')).toBeInTheDocument()
  })

  it('status 0 mostra sem conexão', () => {
    render(<ErrorState erro={new ErroApi(0, null)} />)
    expect(screen.getByText('Sem conexão com o servidor')).toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('mostra título e descrição', () => {
    render(<EmptyState icone={Inbox} titulo="Tudo em dia" descricao="Nada pendente." />)
    expect(screen.getByText('Tudo em dia')).toBeInTheDocument()
    expect(screen.getByText('Nada pendente.')).toBeInTheDocument()
  })
})

describe('ConfirmDialog', () => {
  it('tem foco inicial em Cancelar', () => {
    render(
      <ConfirmDialog
        aberto
        aoMudarAberto={() => undefined}
        titulo="Excluir tipo de problema"
        descricao="Esta ação não pode ser desfeita."
        rotuloConfirmar="Excluir"
        destrutivo
        aoConfirmar={() => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  })
})

describe('criarRouter', () => {
  it('rota inexistente mostra NotFoundState', async () => {
    window.history.replaceState(null, '', '/rota-que-nao-existe')
    const router = criarRouter(new QueryClient())
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Página não encontrada')).toBeInTheDocument()
    expect(screen.getByText('O endereço que você abriu não existe ou foi movido.')).toBeInTheDocument()
  })
})

describe('NotFoundState', () => {
  it('usa o texto padrão', () => {
    render(<NotFoundState />)
    expect(screen.getByText('Página não encontrada')).toBeInTheDocument()
  })
})
