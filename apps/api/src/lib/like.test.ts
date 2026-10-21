import { describe, expect, it } from 'vitest'
import { escaparLike } from './like'

describe('escaparLike', () => {
  it('escapa %, _ e a própria barra invertida', () => {
    expect(escaparLike('50%_a\\')).toBe('50\\%\\_a\\\\')
  })

  it('devolve o texto intacto quando não há curingas', () => {
    expect(escaparLike('chamado comum')).toBe('chamado comum')
  })
})
