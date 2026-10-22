import { describe, expect, it } from 'vitest'
import { BOM_CSV, celulaCsv, linhaCsv } from './csv'

describe('celulaCsv', () => {
  it('neutraliza fórmulas', () => {
    expect(celulaCsv('=1+1')).toBe("'=1+1")
    expect(celulaCsv('@cmd')).toBe("'@cmd")
    expect(celulaCsv('-2')).toBe("'-2")
  })

  it('escapa aspas e envolve só quando preciso', () => {
    expect(celulaCsv('a"b')).toBe('"a""b"')
    expect(celulaCsv('a;b')).toBe('"a;b"')
    expect(celulaCsv('simples')).toBe('simples')
  })

  it('trata nulos e datas', () => {
    expect(celulaCsv(null)).toBe('')
    expect(celulaCsv(undefined)).toBe('')
    expect(celulaCsv(new Date('2026-10-21T00:00:00.000Z'))).toBe('2026-10-21T00:00:00.000Z')
  })
})

describe('linhaCsv', () => {
  it('separa por ponto e vírgula e termina com CRLF', () => {
    expect(linhaCsv(['a', 1, null])).toBe('a;1;\r\n')
  })
  it('exporta o BOM', () => {
    expect(BOM_CSV).toBe('﻿')
  })
})
