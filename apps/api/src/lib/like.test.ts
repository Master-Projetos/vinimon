import { describe, expect, it } from 'vitest'
import { escaparLike } from './like'

describe('escaparLike', () => {
  it('escapa %, _ e a barra invertida', () => {
    expect(escaparLike('50%_a\\')).toBe('50\\%\\_a\\\\')
  })

  it('não altera texto comum', () => {
    expect(escaparLike('impressora')).toBe('impressora')
  })
})
