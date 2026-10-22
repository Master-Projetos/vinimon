import { describe, expect, it } from 'vitest'
import { cifrar, decifrar, hmacProposito } from './cripto'

describe('cifrar / decifrar', () => {
  it('faz a ida e volta, com IV novo a cada chamada', () => {
    const a = cifrar('JBSWY3DPEHPK3PXP')
    expect(a).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/)
    expect(decifrar(a)).toBe('JBSWY3DPEHPK3PXP')
    expect(cifrar('JBSWY3DPEHPK3PXP')).not.toBe(a)
  })

  it('alterar 1 byte do texto cifrado lança erro', () => {
    const [p, iv, tag, ct] = cifrar('segredo').split(':')
    const bytes = Buffer.from(ct ?? '', 'base64')
    bytes[0] = (bytes[0] ?? 0) ^ 1
    expect(() => decifrar([p, iv, tag, bytes.toString('base64')].join(':'))).toThrow()
  })

  it('recusa prefixo e formato inválidos', () => {
    expect(() => decifrar('v2:a:b:c')).toThrow()
    expect(() => decifrar('lixo')).toThrow()
  })
})

describe('hmacProposito', () => {
  it('propósitos diferentes geram valores diferentes', () => {
    expect(hmacProposito('a', 'x').equals(hmacProposito('b', 'x'))).toBe(false)
    expect(hmacProposito('a', 'x').equals(hmacProposito('a', 'x'))).toBe(true)
  })
})
