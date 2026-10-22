import { describe, expect, it } from 'vitest'
import { PaginacaoQuerySchema, zDataHora, zListaIds } from './http'

describe('zDataHora', () => {
  it('decodifica ISO para Date e codifica de volta', () => {
    const schema = zDataHora()
    const data = schema.decode('2026-10-21T12:30:00.000Z')
    expect(data).toBeInstanceOf(Date)
    expect(schema.encode(data)).toBe('2026-10-21T12:30:00.000Z')
  })

  it('recusa data inválida', () => {
    expect(zDataHora().safeParse('2026-13-01').success).toBe(false)
  })
})

describe('zListaIds', () => {
  const schema = zListaIds()

  it('aceita um valor só e vários valores', () => {
    expect(schema.parse('3')).toEqual([3])
    expect(schema.parse(['1', '2'])).toEqual([1, 2])
  })

  it('aceita ausência', () => {
    expect(schema.parse(undefined)).toBeUndefined()
  })

  it('recusa mais de 50 itens', () => {
    expect(schema.safeParse(Array.from({ length: 51 }, (_, i) => String(i + 1))).success).toBe(false)
  })
})

describe('PaginacaoQuerySchema', () => {
  it('usa os padrões', () => {
    expect(PaginacaoQuerySchema.parse({})).toEqual({ pagina: 1, porPagina: 25 })
  })

  it('recusa porPagina fora de 1..100', () => {
    expect(PaginacaoQuerySchema.safeParse({ porPagina: '0' }).success).toBe(false)
    expect(PaginacaoQuerySchema.safeParse({ porPagina: '101' }).success).toBe(false)
    expect(PaginacaoQuerySchema.safeParse({ porPagina: '100' }).success).toBe(true)
  })
})
