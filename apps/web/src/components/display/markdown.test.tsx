import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { converterMencoes, Markdown } from './markdown'

afterEach(() => {
  cleanup()
})

describe('Markdown seguro (S78, T67)', () => {
  it('<script> não vira elemento e não executa', () => {
    const { container } = render(<Markdown texto={'Oi <script>window.__xss = 1</script>'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
    expect('__xss' in window).toBe(false)
  })

  it('link javascript: não gera href com javascript:', () => {
    const { container } = render(<Markdown texto="[x](javascript:alert(1))" />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '')
    expect(hrefs.some((href) => href.toLowerCase().startsWith('javascript:'))).toBe(false)
  })

  it('link http ganha target e rel seguros', () => {
    const { container } = render(<Markdown texto="[site](https://exemplo.com.br)" />)
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://exemplo.com.br')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer nofollow')
  })

  it('o token de menção vira chip', () => {
    render(<Markdown texto="Oi @[Ana](usuario:7)!" />)
    const chip = screen.getByText('@Ana')
    expect(chip.tagName).toBe('SPAN')
    expect(chip.getAttribute('data-mencao')).toBe('7')
    expect(chip.closest('a')).toBeNull()
  })

  it('converterMencoes troca o token por link Markdown', () => {
    expect(converterMencoes('@[Ana](usuario:7) e @[Bruno](usuario:12)')).toBe(
      '[@Ana](usuario:7) e [@Bruno](usuario:12)',
    )
  })
})
