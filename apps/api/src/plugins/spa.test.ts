import { describe, expect, it } from 'vitest'
import { ehAssetEstatico } from './spa'

describe('ehAssetEstatico', () => {
  it('isenta só leituras de /assets/ do rate limit por IP', () => {
    expect(ehAssetEstatico('GET', '/assets/index-B9_cSD0j.js')).toBe(true)
    expect(ehAssetEstatico('HEAD', '/assets/estilo-1.css')).toBe(true)
    expect(ehAssetEstatico('POST', '/assets/index.js')).toBe(false)
    expect(ehAssetEstatico('GET', '/api/v1/auth/sessao')).toBe(false)
    expect(ehAssetEstatico('GET', '/login')).toBe(false)
    expect(ehAssetEstatico('GET', '/api/v1/assets/x')).toBe(false)
  })
})
