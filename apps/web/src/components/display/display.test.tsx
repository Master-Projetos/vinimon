import { cleanup, render, screen } from '@testing-library/react'
import type { DadosSla } from '@vinimon/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { contraste, obterCores } from '@/lib/cores'
import { ColorBadge } from './color-badge'
import { PrioridadeBadge } from './prioridade-badge'
import { RelativeTime } from './relative-time'
import { SlaBadge } from './sla-badge'
import { StatusBadge } from './status-badge'

afterEach(() => {
  cleanup()
})

const AGORA = new Date('2026-10-22T12:00:00Z')
const base: DadosSla = { meta: 60, prazo: null, alerta: null, cumprido: null, finalizado: false, cancelado: false }

describe('ColorBadge', () => {
  it('define as variáveis --b-* com as cores de obterCores', () => {
    const cores = obterCores('#ffff00')
    render(<ColorBadge cor="#ffff00">Urgente</ColorBadge>)
    const badge = screen.getByText('Urgente')
    expect(badge?.style.getPropertyValue('--b-bg')).toBe(cores.claro.fundo)
    expect(badge?.style.getPropertyValue('--b-fg-d')).toBe(cores.escuro.texto)
  })

  it('mantém contraste ≥ 4,5 para #ffff00 nos dois temas', () => {
    const cores = obterCores('#ffff00')
    expect(contraste(cores.claro.texto, cores.claro.fundo)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(cores.escuro.texto, cores.escuro.fundo)).toBeGreaterThanOrEqual(4.5)
  })

  it('StatusBadge e PrioridadeBadge mostram o nome', () => {
    render(
      <>
        <StatusBadge nome="Em atendimento" cor="#0891b2" />
        <PrioridadeBadge nome="Alta" cor="#dc2626" />
      </>,
    )
    expect(screen.getByText('Em atendimento')).toBeInTheDocument()
    expect(screen.getByText('Alta')).toBeInTheDocument()
  })
})

describe('SlaBadge', () => {
  it('mostra "Vencido" quando o prazo passou', () => {
    render(<SlaBadge sla={{ ...base, prazo: new Date('2026-10-22T11:00:00Z') }} agora={AGORA} />)
    expect(screen.getByText('Vencido')).toBeInTheDocument()
  })

  it('mostra "No prazo" antes do alerta e "Em risco" depois dele', () => {
    const { rerender } = render(
      <SlaBadge
        sla={{ ...base, prazo: new Date('2026-10-22T18:00:00Z'), alerta: new Date('2026-10-22T17:00:00Z') }}
        agora={AGORA}
      />,
    )
    expect(screen.getByText('No prazo')).toBeInTheDocument()
    rerender(
      <SlaBadge
        sla={{ ...base, prazo: new Date('2026-10-22T12:30:00Z'), alerta: new Date('2026-10-22T11:30:00Z') }}
        agora={AGORA}
      />,
    )
    expect(screen.getByText('Em risco')).toBeInTheDocument()
  })

  it('mostra "Pausado" sem prazo e "Sem SLA" sem meta', () => {
    const { rerender } = render(<SlaBadge sla={base} agora={AGORA} />)
    expect(screen.getByText('Pausado')).toBeInTheDocument()
    rerender(<SlaBadge sla={{ ...base, meta: null }} agora={AGORA} />)
    expect(screen.getByText('Sem SLA')).toBeInTheDocument()
  })
})

describe('RelativeTime', () => {
  it('renderiza <time> com dateTime e título com data completa', () => {
    const valor = new Date('2026-10-22T09:00:00Z')
    render(<RelativeTime valor={valor} agora={AGORA} />)
    const tempo = document.querySelector('time')
    expect(tempo).not.toBeNull()
    expect(tempo?.textContent).toBe('há cerca de 3 horas')
    expect(tempo?.getAttribute('datetime')).toBe('2026-10-22T09:00:00.000Z')
    expect(tempo?.getAttribute('title')).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
  })
})
