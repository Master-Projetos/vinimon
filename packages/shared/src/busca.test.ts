import { describe, expect, it } from 'vitest'
import { idChamadoExato, normalizarBusca, tokensBusca } from './busca'

describe('normalizarBusca', () => {
  it('tira acento e põe em minúsculas', () => {
    expect(normalizarBusca('Impressão')).toBe('impressao')
  })

  it('colapsa espaços e corta em 100 caracteres', () => {
    expect(normalizarBusca('  a   b  ')).toBe('a b')
    expect(normalizarBusca('x'.repeat(150))).toHaveLength(100)
  })
})

describe('tokensBusca', () => {
  it('separa por pontuação e descarta tokens fora de 2 a 30 caracteres', () => {
    expect(tokensBusca(`Impressora-HP, a ${'b'.repeat(31)}`)).toEqual(['impressora', 'hp'])
  })

  it('usa no máximo 8 tokens', () => {
    expect(tokensBusca('um dois tres quatro cinco seis sete oito nove dez')).toHaveLength(8)
  })

  it('não deixa curinga passar', () => {
    expect(tokensBusca('100% *_%')).toEqual(['100'])
  })
})

describe('idChamadoExato', () => {
  it('lê número com ou sem #', () => {
    expect(idChamadoExato('#123')).toBe(123)
    expect(idChamadoExato('123')).toBe(123)
  })

  it('devolve nulo para o que não é número de chamado', () => {
    expect(idChamadoExato('12a')).toBeNull()
    expect(idChamadoExato('1234567890')).toBeNull()
    expect(idChamadoExato('')).toBeNull()
  })
})
