import { describe, expect, it } from 'vitest'
import { zAssunto, zCor, zEmail, zTelefone } from './limites'

describe('zAssunto', () => {
  it('aceita de 3 a 150 caracteres', () => {
    expect(zAssunto().safeParse('abc').success).toBe(true)
    expect(zAssunto().safeParse('a'.repeat(150)).success).toBe(true)
  })

  it('recusa 2 e 151 caracteres', () => {
    expect(zAssunto().safeParse('ab').success).toBe(false)
    expect(zAssunto().safeParse('a'.repeat(151)).success).toBe(false)
  })
})

describe('zCor', () => {
  it('aceita #RRGGBB', () => {
    expect(zCor().safeParse('#1a2B3c').success).toBe(true)
  })

  it('recusa a forma curta #fff', () => {
    expect(zCor().safeParse('#fff').success).toBe(false)
  })
})

describe('zEmail', () => {
  it('recusa texto que não é e-mail', () => {
    expect(zEmail().safeParse('nao-e-email').success).toBe(false)
  })
})

describe('zTelefone', () => {
  it('aceita número com símbolos permitidos', () => {
    expect(zTelefone().safeParse('+55 (31) 99999-0000').success).toBe(true)
  })

  it('recusa letras', () => {
    expect(zTelefone().safeParse('31 abc').success).toBe(false)
  })
})
