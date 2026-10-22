import { describe, expect, it } from 'vitest'
import {
  ChamadoDigitandoSchema,
  ChamadoEntrarSchema,
  ChamadoSairSchema,
  PresencaAssinarSchema,
  PresencaAtividadeSchema,
} from './realtime'

describe('payloads de tempo real', () => {
  it('aceita payloads válidos', () => {
    expect(ChamadoEntrarSchema.safeParse({ chamadoId: 1 }).success).toBe(true)
    expect(ChamadoSairSchema.safeParse({ chamadoId: 1 }).success).toBe(true)
    expect(ChamadoDigitandoSchema.safeParse({ chamadoId: 1, interno: false, digitando: true }).success).toBe(true)
    expect(PresencaAtividadeSchema.safeParse({ ativo: true }).success).toBe(true)
    expect(PresencaAssinarSchema.safeParse({ usuarioIds: [1, 2] }).success).toBe(true)
  })

  it('payload com chave extra dá erro', () => {
    expect(ChamadoEntrarSchema.safeParse({ chamadoId: 1, extra: 1 }).success).toBe(false)
    expect(ChamadoDigitandoSchema.safeParse({ chamadoId: 1, interno: false, digitando: true, x: 1 }).success).toBe(
      false,
    )
    expect(PresencaAtividadeSchema.safeParse({ ativo: true, x: 1 }).success).toBe(false)
  })

  it('rejeita tipos e limites inválidos', () => {
    expect(ChamadoEntrarSchema.safeParse({ chamadoId: '1' }).success).toBe(false)
    expect(ChamadoEntrarSchema.safeParse({ chamadoId: 0 }).success).toBe(false)
    expect(PresencaAssinarSchema.safeParse({ usuarioIds: Array.from({ length: 201 }, (_, i) => i + 1) }).success).toBe(
      false,
    )
  })
})
