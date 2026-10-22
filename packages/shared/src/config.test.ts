import { describe, expect, it } from 'vitest'
import { AtualizarConfigSchema, CHAVES_CONFIG_PUBLICAS, CONFIG_PADRAO, ConfigSchema } from './config'

describe('config', () => {
  it('o padrão é válido', () => {
    expect(ConfigSchema.parse(CONFIG_PADRAO)).toEqual(CONFIG_PADRAO)
  })

  it('a atualização aceita chaves parciais e recusa chave desconhecida', () => {
    expect(AtualizarConfigSchema.safeParse({ 'sla.alertaPct': 90 }).success).toBe(true)
    expect(AtualizarConfigSchema.safeParse({ 'chave.inexistente': 1 }).success).toBe(false)
  })

  it('recusa valor fora do intervalo', () => {
    expect(AtualizarConfigSchema.safeParse({ 'sla.alertaPct': 10 }).success).toBe(false)
  })

  it('as chaves públicas existem na config', () => {
    for (const c of CHAVES_CONFIG_PUBLICAS) expect(c in CONFIG_PADRAO).toBe(true)
  })
})
