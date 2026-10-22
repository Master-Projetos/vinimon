import { generate } from 'otplib'
import { describe, expect, it } from 'vitest'
import { gerarCodigosRecuperacao, gerarSegredo, hashCodigo, uriOtpauth, verificarCodigo } from './totp'

describe('verificarCodigo', () => {
  it('aceita o código atual e recusa o reuso do mesmo passo', async () => {
    const secret = gerarSegredo()
    const codigo = await generate({ secret })
    const r = await verificarCodigo(secret, codigo, null)
    expect(r.valido).toBe(true)
    expect(r.passo).toBeTypeOf('number')
    expect((await verificarCodigo(secret, codigo, r.passo)).valido).toBe(false)
  })

  it('recusa código malformado ou errado', async () => {
    const secret = gerarSegredo()
    expect((await verificarCodigo(secret, '12345', null)).valido).toBe(false)
    expect((await verificarCodigo(secret, 'abcdef', null)).valido).toBe(false)
    expect((await verificarCodigo(secret, '000000', null)).valido).toBe(false)
  })
})

describe('códigos de recuperação', () => {
  it('gera 10 códigos únicos no formato XXXX-XXXX-XXXX-XXXX', () => {
    const codigos = gerarCodigosRecuperacao()
    expect(codigos).toHaveLength(10)
    expect(new Set(codigos).size).toBe(10)
    for (const c of codigos) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/)
  })

  it('o hash ignora hífens, espaços e caixa', () => {
    expect(hashCodigo('abcd-efgh-jkmn-pqrs')).toBe(hashCodigo('ABCDEFGHJKMNPQRS'))
    expect(hashCodigo('ABCD-EFGH-JKMN-PQRS')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('uriOtpauth', () => {
  it('monta a URI otpauth', () => {
    expect(uriOtpauth({ issuer: 'Vinimon', label: 'admin', secret: gerarSegredo() })).toMatch(/^otpauth:\/\/totp\//)
  })
})
