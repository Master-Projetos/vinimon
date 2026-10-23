import { cleanup, screen, within } from '@testing-library/react'
import type { SessaoResposta, UsuarioMe } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { renderRota } from '@/test/render-rota'

afterEach(() => {
  cleanup()
})

function usuarioDe(perfil: UsuarioMe['perfil']): UsuarioMe {
  return {
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
}

function sessaoDe(perfil: UsuarioMe['perfil']): SessaoResposta {
  return { estado: 'ATIVA', csrf: 'csrf-teste', usuario: usuarioDe(perfil) }
}

// A guarda de `_app` é assíncrona: espera a app bar aparecer antes de consultar a árvore.
async function montar(perfil: UsuarioMe['perfil']) {
  renderRota('/painel', { sessao: sessaoDe(perfil), respostas: {} })
  await screen.findByRole('navigation', { name: 'Aplicativos' })
}

describe('AppShell', () => {
  it('o primeiro elemento focável é o SkipLink, que leva ao conteúdo', async () => {
    await montar('USUARIO')
    const focaveis = Array.from(
      document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]'),
    ).filter((el) => el.tabIndex >= 0)
    expect(focaveis[0]).toHaveTextContent('Pular para o conteúdo')
    expect(focaveis[0]).toHaveAttribute('href', '#conteudo')
    expect(document.getElementById('conteudo')?.tagName).toBe('MAIN')
  })

  it('USUARIO não vê Inventário, Relatórios nem Administração', async () => {
    await montar('USUARIO')
    const app = screen.getByRole('navigation', { name: 'Aplicativos' })
    expect(within(app).getByRole('link', { name: 'Atividade' })).toBeInTheDocument()
    expect(within(app).getByRole('link', { name: 'Chamados' })).toBeInTheDocument()
    expect(within(app).queryByRole('link', { name: 'Inventário' })).toBeNull()
    expect(within(app).queryByRole('link', { name: 'Relatórios' })).toBeNull()
    expect(within(app).queryByRole('link', { name: 'Administração' })).toBeNull()
  })

  it('OPERADOR vê Inventário e Relatórios, mas não Administração', async () => {
    await montar('OPERADOR')
    const app = screen.getByRole('navigation', { name: 'Aplicativos' })
    expect(within(app).getByRole('link', { name: 'Inventário' })).toBeInTheDocument()
    expect(within(app).getByRole('link', { name: 'Relatórios' })).toBeInTheDocument()
    expect(within(app).queryByRole('link', { name: 'Administração' })).toBeNull()
  })

  it('ADMIN vê todos os itens e a rota ativa tem aria-current', async () => {
    await montar('ADMIN')
    const app = screen.getByRole('navigation', { name: 'Aplicativos' })
    expect(within(app).getByRole('link', { name: 'Administração' })).toBeInTheDocument()
    expect(within(app).getByRole('link', { name: 'Painel' })).toHaveAttribute('aria-current', 'page')
  })

  it('a navegação móvel está presente e só aparece abaixo de md', async () => {
    await montar('USUARIO')
    const movel = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(movel).toHaveClass('md:hidden')
    expect(within(movel).getByRole('link', { name: 'Chamados' })).toBeInTheDocument()
    expect(within(movel).getByRole('button', { name: 'Mais' })).toBeInTheDocument()
  })
})
