import { randomBytes, scryptSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashSenha, precisaRehash, verificarSenha } from './senha'

describe('senha', () => {
  it('T05: hash novo é argon2id com os parâmetros da S7', async () => {
    const h = await hashSenha('Cavalo-Bateria-Grampo-2026')
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(precisaRehash(h)).toBe(false)
  })

  it('confere senha argon2id correta e recusa a errada', async () => {
    const h = await hashSenha('senha-correta-123')
    await expect(verificarSenha('senha-correta-123', h)).resolves.toEqual({ ok: true, precisaRehash: false })
    await expect(verificarSenha('outra-senha-456', h)).resolves.toEqual({ ok: false, precisaRehash: false })
  })

  it('T06: hash legado da v1 (scrypt com salt hex como string) confere e pede rehash', async () => {
    const saltHex = randomBytes(16).toString('hex')
    const legado = `${saltHex}:${scryptSync('abc', saltHex, 64).toString('hex')}`
    await expect(verificarSenha('abc', legado)).resolves.toEqual({ ok: true, precisaRehash: true })
    await expect(verificarSenha('abd', legado)).resolves.toEqual({ ok: false, precisaRehash: false })
  })

  it('hash nulo ou desconhecido nunca confere', async () => {
    await expect(verificarSenha('x', null)).resolves.toEqual({ ok: false, precisaRehash: false })
    await expect(verificarSenha('x', 'lixo')).resolves.toEqual({ ok: false, precisaRehash: false })
  })
})
