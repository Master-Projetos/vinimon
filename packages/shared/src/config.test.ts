import { describe, expect, it } from 'vitest'
import { AtualizarConfigSchema, CONFIG_PADRAO, ConfigSchema } from './config'

describe('ConfigSchema', () => {
  it('aceita o padrão de fábrica', () => {
    expect(ConfigSchema.safeParse(CONFIG_PADRAO).success).toBe(true)
  })
})

describe('AtualizarConfigSchema', () => {
  it('aceita só as chaves enviadas', () => {
    expect(AtualizarConfigSchema.safeParse({ 'sistema.nome': 'Vinimon Teste' }).success).toBe(true)
  })

  it('recusa chave desconhecida', () => {
    expect(AtualizarConfigSchema.safeParse({ 'chave.inexistente': 1 }).success).toBe(false)
  })
})
