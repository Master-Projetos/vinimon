import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AvatarGroup } from './avatar-group'
import { KbdShortcut, rotuloTecla } from './kbd-shortcut'
import { KeyValueGrid } from './key-value-grid'
import { Pode } from './pode'
import { PresenceIndicator } from './presence-indicator'
import { StatCard } from './stat-card'
import { corDoAvatar, iniciaisDe, UserAvatar } from './user-avatar'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('UserAvatar', () => {
  it('mostra as iniciais e usa a cor por id % 8', () => {
    expect(iniciaisDe('ana souza')).toBe('AS')
    expect(iniciaisDe('Maria')).toBe('M')
    expect(corDoAvatar(8)).toBe(corDoAvatar(0))
    expect(corDoAvatar(9)).toBe('#0891b2')

    render(<UserAvatar usuario={{ id: 9, nome: 'Ana Souza' }} />)
    const avatar = screen.getByRole('img', { name: 'Ana Souza' })
    expect(avatar.textContent).toBe('AS')
  })
})

describe('AvatarGroup', () => {
  it('resume os excedentes com texto para leitor de tela', () => {
    render(
      <AvatarGroup
        max={2}
        usuarios={[
          { id: 1, nome: 'Ana Souza' },
          { id: 2, nome: 'Bruno Lima' },
          { id: 3, nome: 'Carla Dias' },
          { id: 4, nome: 'Davi Reis' },
        ]}
      />,
    )
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getByText('e mais 2 usuários')).toBeInTheDocument()
  })
})

describe('PresenceIndicator', () => {
  it('tem o texto sr-only "Disponível" além do glifo', () => {
    render(<PresenceIndicator status="DISPONIVEL" />)
    expect(screen.getByText('Disponível')).toHaveClass('sr-only')
  })

  it('rotula ocupado e ausente sem depender da cor', () => {
    render(
      <>
        <PresenceIndicator status="OCUPADO" />
        <PresenceIndicator status="AUSENTE" />
      </>,
    )
    expect(screen.getByText('Ocupado')).toHaveClass('sr-only')
    expect(screen.getByText('Ausente')).toHaveClass('sr-only')
  })
})

describe('Pode', () => {
  it('esconde o conteúdo para USUARIO e mostra o senao', () => {
    render(
      <Pode perfil="USUARIO" permissao="chamado.atender" senao={<span>sem acesso</span>}>
        <span>atender</span>
      </Pode>,
    )
    expect(screen.queryByText('atender')).toBeNull()
    expect(screen.getByText('sem acesso')).toBeInTheDocument()
  })

  it('mostra o conteúdo para OPERADOR com a permissão', () => {
    render(
      <Pode perfil="OPERADOR" permissao="chamado.atender">
        <span>atender</span>
      </Pode>,
    )
    expect(screen.getByText('atender')).toBeInTheDocument()
  })
})

describe('KbdShortcut', () => {
  it('mostra ⌘ no Mac e Ctrl nos demais', () => {
    expect(rotuloTecla('mod', true)).toBe('⌘')
    expect(rotuloTecla('mod', false)).toBe('Ctrl')
    expect(rotuloTecla('K', true)).toBe('K')

    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')
    render(<KbdShortcut teclas={['mod', 'K']} />)
    expect(screen.getByText('⌘')).toBeInTheDocument()
    expect(screen.getByText('K')).toBeInTheDocument()
  })
})

describe('KeyValueGrid', () => {
  it('renderiza pares rótulo/valor', () => {
    render(<KeyValueGrid itens={[{ rotulo: 'Área', valor: 'TI', dica: 'Área responsável' }]} />)
    expect(screen.getByText('Área')).toBeInTheDocument()
    expect(screen.getByText('TI')).toBeInTheDocument()
  })
})

describe('StatCard', () => {
  it('mostra título, valor e estado de carregamento', () => {
    const { rerender } = render(<StatCard titulo="Abertos" valor={12} />)
    expect(screen.getByText('Abertos')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    rerender(<StatCard titulo="Abertos" valor={12} carregando />)
    expect(screen.getByText('Carregando')).toHaveClass('sr-only')
  })
})
