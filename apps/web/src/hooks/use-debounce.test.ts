import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebounce } from './use-debounce'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useDebounce', () => {
  it('só devolve o novo valor depois do atraso', () => {
    const { result, rerender } = renderHook(({ valor }) => useDebounce(valor, 300), {
      initialProps: { valor: 'a' },
    })
    expect(result.current).toBe('a')

    rerender({ valor: 'ab' })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('ab')
  })
})
