import { act, render, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DensityProvider, useDensidade } from './density-provider'
import { ThemeProvider, useTheme } from './theme-provider'

function envolver({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('definirTema("ESCURO") põe a classe dark no html e grava em vinimon:tema', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: envolver })

    act(() => result.current.definirTema('ESCURO'))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(result.current.tema).toBe('escuro')
    expect(result.current.temaEfetivo).toBe('escuro')
    expect(window.localStorage.getItem('vinimon:tema')).toBe('"escuro"')
  })

  it('definirTema("claro") remove a classe dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: envolver })

    act(() => result.current.definirTema('escuro'))
    act(() => result.current.definirTema('claro'))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(result.current.temaEfetivo).toBe('claro')
  })

  it('usa o tema salvo em vinimon:tema ao montar', () => {
    window.localStorage.setItem('vinimon:tema', '"escuro"')

    const { result } = renderHook(() => useTheme(), { wrapper: envolver })

    expect(result.current.tema).toBe('escuro')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('ignora valor salvo inválido e cai no padrão sistema', () => {
    window.localStorage.setItem('vinimon:tema', '"roxo"')

    const { result } = renderHook(() => useTheme(), { wrapper: envolver })

    expect(result.current.tema).toBe('sistema')
  })

  it('useTheme fora do provider lança erro', () => {
    expect(() => renderHook(() => useTheme())).toThrow('useTheme deve ser usado dentro de ThemeProvider')
  })
})

describe('DensityProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete document.documentElement.dataset.densidade
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('definirDensidade("compacta") põe data-densidade no html e grava em vinimon:densidade', () => {
    const { result } = renderHook(() => useDensidade(), {
      wrapper: ({ children }: { children: ReactNode }) => <DensityProvider>{children}</DensityProvider>,
    })

    act(() => result.current.definirDensidade('compacta'))

    expect(document.documentElement.dataset.densidade).toBe('compacta')
    expect(window.localStorage.getItem('vinimon:densidade')).toBe('"compacta"')
  })

  it('renderiza os filhos', () => {
    const { getByText } = render(
      <DensityProvider>
        <p>conteúdo</p>
      </DensityProvider>,
    )
    expect(getByText('conteúdo').textContent).toBe('conteúdo')
  })
})
