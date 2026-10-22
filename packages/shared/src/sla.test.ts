import { describe, expect, it } from 'vitest'
import { type DadosSla, SITUACOES_SLA, type SituacaoSla, situacaoSla } from './sla'

const agora = new Date('2026-10-26T12:00:00Z')
const base: DadosSla = {
  meta: 60,
  prazo: new Date('2026-10-26T13:00:00Z'),
  alerta: new Date('2026-10-26T12:30:00Z'),
  cumprido: null,
  finalizado: false,
  cancelado: false,
}

describe('situacaoSla', () => {
  it('26: cobre os 7 estados', () => {
    const casos: Array<[SituacaoSla, DadosSla, Date]> = [
      ['SEM_SLA', { ...base, meta: null }, agora],
      ['SEM_SLA', { ...base, cancelado: true }, agora],
      ['NO_PRAZO', base, agora],
      ['EM_RISCO', base, new Date('2026-10-26T12:30:00Z')],
      ['ESTOURADO', base, new Date('2026-10-26T13:00:01Z')],
      ['PAUSADO', { ...base, prazo: null, alerta: null }, agora],
      ['CUMPRIDO', { ...base, finalizado: true, cumprido: true }, agora],
      ['VIOLADO', { ...base, finalizado: true, cumprido: false }, agora],
    ]
    for (const [esperado, dados, quando] of casos) expect(situacaoSla(dados, quando)).toBe(esperado)
    expect(new Set(casos.map(([s]) => s))).toEqual(new Set(SITUACOES_SLA))
  })

  it('prazo exato ainda é NO_PRAZO/EM_RISCO e finalizado sem veredito é CUMPRIDO', () => {
    expect(situacaoSla(base, new Date('2026-10-26T13:00:00Z'))).toBe('EM_RISCO')
    expect(situacaoSla({ ...base, alerta: null }, new Date('2026-10-26T13:00:00Z'))).toBe('NO_PRAZO')
    expect(situacaoSla({ ...base, finalizado: true }, agora)).toBe('CUMPRIDO')
  })
})
