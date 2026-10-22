import { describe, expect, it } from 'vitest'
import { contraste, corDeGrafico, coresDeBadge, corSolida, hexParaRgb } from './cores'

// Gerador pseudoaleatório com semente fixa: o conjunto de cores é sempre o mesmo.
function geradorDeCores(semente: number) {
  let estado = semente >>> 0
  return (): string => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    const n = ((t ^ (t >>> 14)) >>> 0) & 0xffffff
    return `#${n.toString(16).padStart(6, '0')}`
  }
}

const cores = (() => {
  const proxima = geradorDeCores(20260101)
  return Array.from({ length: 5000 }, () => proxima())
})()

describe('cores', () => {
  it('texto do badge tem contraste >= 4,5 nos dois modos para 5.000 cores', () => {
    for (const hex of cores) {
      const claro = coresDeBadge(hex, 'claro')
      const escuro = coresDeBadge(hex, 'escuro')
      expect(contraste(claro.texto, claro.fundo), `claro ${hex}`).toBeGreaterThanOrEqual(4.5)
      expect(contraste(escuro.texto, escuro.fundo), `escuro ${hex}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('variante sólida tem contraste >= 4,5 para 5.000 cores', () => {
    for (const hex of cores) {
      const solida = corSolida(hex)
      expect(contraste(solida.texto, solida.fundo), hex).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('cor de gráfico tem contraste >= 3 contra as superfícies de referência', () => {
    const superficies = ['#ffffff', '#f8f9fb', '#1d1e21', '#202226']
    for (const hex of cores) {
      for (const superficie of superficies) {
        const modo = superficie === '#ffffff' || superficie === '#f8f9fb' ? 'claro' : 'escuro'
        const cor = corDeGrafico(hex, modo)
        expect(contraste(cor, superficie), `${hex} sobre ${superficie}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('hex inválido lança erro', () => {
    expect(() => hexParaRgb('#xyz123')).toThrow('Cor inválida')
    expect(() => hexParaRgb('azul')).toThrow('Cor inválida')
    expect(() => coresDeBadge('#12345', 'claro')).toThrow('Cor inválida')
  })
})
