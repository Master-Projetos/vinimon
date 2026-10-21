import { randomBytes, scryptSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashSenha, verificarSenha } from './senha'

describe('senha', () => {
  it('gera hash argon2id com os parâmetros OWASP (T05)', async () => {
    const hash = await hashSenha('abc')
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })

  it('confere hash legado scrypt da v1 e pede rehash', async () => {
    const saltHex = randomBytes(16).toString('hex')
    const hashHex = scryptSync('abc', saltHex, 64).toString('hex')
    const resultado = await verificarSenha('abc', `${saltHex}:${hashHex}`)
    expect(resultado).toEqual({ ok: true, precisaRehash: true })
  })

  it('recusa senha errada', async () => {
    const hash = await hashSenha('abc')
    const resultado = await verificarSenha('errada', hash)
    expect(resultado.ok).toBe(false)
  })

  it('verifica contra hash fictício quando o usuário não existe', async () => {
    const resultado = await verificarSenha('qualquer', null)
    expect(resultado).toEqual({ ok: false, precisaRehash: false })
  })
})
