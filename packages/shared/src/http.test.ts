import { describe, expect, it } from 'vitest'
import { PaginacaoQuerySchema, zDataHora, zListaIds } from './http'

describe('zDataHora', () => {
  it('decodifica ISO para Date e codifica de volta para ISO', () => {
    const iso = '2026-10-21T12:30:00.000Z'
    const data = zDataHora().parse(iso)

    expect(data).toBeInstanceOf(Date)
    expect(zDataHora().encode(data)).toBe(iso)
  })

  it('recusa data inválida', () => {
    expect(zDataHora().safeParse('2026-13-01').success).toBe(false)
  })
})

describe('zListaIds', () => {
  it('aceita um valor avulso', () => {
    expect(zListaIds().parse('3')).toEqual([3])
  })

  it('aceita vários valores', () => {
    expect(zListaIds().parse(['1', '2'])).toEqual([1, 2])
  })

  it('recusa mais de 50 itens', () => {
    const ids = Array.from({ length: 51 }, (_, i) => String(i + 1))

    expect(zListaIds().safeParse(ids).success).toBe(false)
  })
})

describe('PaginacaoQuerySchema', () => {
  it('usa pagina 1 e porPagina 25 como padrão', () => {
    expect(PaginacaoQuerySchema.parse({})).toEqual({ pagina: 1, porPagina: 25 })
  })

  it('recusa porPagina=0', () => {
    expect(PaginacaoQuerySchema.safeParse({ porPagina: '0' }).success).toBe(false)
  })

  it('recusa porPagina=101', () => {
    expect(PaginacaoQuerySchema.safeParse({ porPagina: '101' }).success).toBe(false)
  })
})
