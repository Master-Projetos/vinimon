import { describe, expect, it } from 'vitest'
import { zAssunto, zBusca, zCor, zEmail, zMotivo, zTag, zTelefone } from './limites'

describe('limites (S56)', () => {
  it('assunto: 3 a 150', () => {
    expect(zAssunto().safeParse('ab').success).toBe(false)
    expect(zAssunto().safeParse('a'.repeat(151)).success).toBe(false)
    expect(zAssunto().safeParse('abc').success).toBe(true)
    expect(zAssunto().safeParse('a'.repeat(150)).success).toBe(true)
  })

  it('cor: #RRGGBB', () => {
    expect(zCor().safeParse('#fff').success).toBe(false)
    expect(zCor().safeParse('#FFaa00').success).toBe(true)
  })

  it('telefone só com caracteres permitidos', () => {
    expect(zTelefone().safeParse('+55 (11) 99999-0000').success).toBe(true)
    expect(zTelefone().safeParse('abc').success).toBe(false)
  })

  it('e-mail, busca, tag e motivo', () => {
    expect(zEmail().safeParse('x').success).toBe(false)
    expect(zBusca().safeParse('a').success).toBe(false)
    expect(zTag().safeParse('a'.repeat(31)).success).toBe(false)
    expect(zMotivo().safeParse('curto').success).toBe(true)
    expect(zMotivo().safeParse('4567').success).toBe(false)
  })

  it('mensagens em português', () => {
    const r = zAssunto().safeParse('a')
    expect(r.success ? '' : r.error.issues[0]?.message).toBe('Use de 3 a 150 caracteres.')
  })
})
