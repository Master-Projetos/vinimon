import { describe, expect, it } from 'vitest'
import { BOM_CSV, celulaCsv, linhaCsv } from './csv'

describe('celulaCsv', () => {
  it('prefixa com apóstrofo valor que começa com fórmula', () => {
    expect(celulaCsv('=1+1')).toBe("'=1+1")
    expect(celulaCsv('@SOMA')).toBe("'@SOMA")
  })

  it('neutraliza tab e retorno de carro no início', () => {
    expect(celulaCsv('\tx')).toBe("'\tx")
    expect(celulaCsv('\rx')).toBe('"\'\rx"')
  })

  it('escapa aspas e envolve a célula em aspas', () => {
    expect(celulaCsv('a"b')).toBe('"a""b"')
  })

  it('envolve em aspas célula com ponto e vírgula', () => {
    expect(celulaCsv('a;b')).toBe('"a;b"')
  })

  it('converte nulo e indefinido em vazio', () => {
    expect(celulaCsv(null)).toBe('')
    expect(celulaCsv(undefined)).toBe('')
  })
})

describe('linhaCsv', () => {
  it('separa por ponto e vírgula e termina com CRLF', () => {
    expect(linhaCsv(['a', 1, null])).toBe('a;1;\r\n')
  })
})

describe('BOM_CSV', () => {
  it('é o BOM UTF-8', () => {
    expect(BOM_CSV).toBe('﻿')
  })
})
