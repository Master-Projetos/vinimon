import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  adicionarDiasUteis,
  adicionarMinutosUteis,
  adicionarMsUteis,
  type CalendarioSla,
  ErroCalendarioSla,
  type Horario,
  minutosUteisEntre,
  msUteisEntre,
} from './calendario'

const SP = 'America/Sao_Paulo'
const util: Horario[] = [1, 2, 3, 4, 5].flatMap((diaSemana) => [
  { diaSemana, inicioMin: 480, fimMin: 720 },
  { diaSemana, inicioMin: 780, fimMin: 1080 },
])

function jornada(extra: Partial<CalendarioSla> = {}): CalendarioSla {
  return {
    timezone: SP,
    ininterrupta: false,
    horarios: util,
    feriados: new Set(),
    feriadosRecorrentes: new Set(),
    ...extra,
  }
}

const comercial = jornada()
const ininterrupta = jornada({ ininterrupta: true, horarios: [] })
const iso = (d: Date) => d.toISOString()
const somar = (inicio: string, min: number, cal: CalendarioSla) =>
  iso(adicionarMinutosUteis(new Date(inicio), min, cal))

describe('calendário de SLA', () => {
  it('1: 24x7 soma direto', () => {
    expect(somar('2026-10-23T20:00:00Z', 240, ininterrupta)).toBe('2026-10-24T00:00:00.000Z')
  })

  it('2: sexta 17h + 120 min vai para segunda', () => {
    expect(somar('2026-10-23T20:00:00Z', 120, comercial)).toBe('2026-10-26T12:00:00.000Z')
  })

  it('3: início no sábado começa na segunda', () => {
    expect(somar('2026-10-24T13:00:00Z', 60, comercial)).toBe('2026-10-26T12:00:00.000Z')
  })

  it('4: início antes da jornada espera a abertura', () => {
    expect(somar('2026-10-26T09:00:00Z', 30, comercial)).toBe('2026-10-26T11:30:00.000Z')
  })

  it('5: pula o almoço', () => {
    expect(somar('2026-10-26T14:30:00Z', 60, comercial)).toBe('2026-10-26T16:30:00.000Z')
  })

  it('6: termina exatamente no fim da janela', () => {
    expect(somar('2026-10-26T20:00:00Z', 60, comercial)).toBe('2026-10-26T21:00:00.000Z')
  })

  it('7: pula feriado', () => {
    const cal = jornada({ feriados: new Set(['2026-11-02']) })
    expect(somar('2026-10-30T20:00:00Z', 120, cal)).toBe('2026-11-03T12:00:00.000Z')
  })

  it('8: pula feriado recorrente', () => {
    const cal = jornada({ feriadosRecorrentes: new Set(['12-25']) })
    expect(somar('2026-12-24T20:00:00Z', 120, cal)).toBe('2026-12-28T12:00:00.000Z')
  })

  it('9: minutos úteis entre dois instantes', () => {
    expect(minutosUteisEntre(new Date('2026-10-23T20:00:00Z'), new Date('2026-10-26T12:00:00Z'), comercial)).toBe(120)
  })

  it('10: fim menor ou igual ao início dá 0', () => {
    const t = new Date('2026-10-26T12:00:00Z')
    expect(msUteisEntre(t, t, comercial)).toBe(0)
    expect(msUteisEntre(t, new Date('2026-10-26T11:00:00Z'), comercial)).toBe(0)
  })

  it('11: somar 0 devolve o próprio início', () => {
    const inicio = new Date('2026-10-24T13:00:00Z')
    expect(adicionarMsUteis(inicio, 0, comercial).getTime()).toBe(inicio.getTime())
  })

  it('12: entre(i, add(i, m)) === m (propriedade)', () => {
    const inicio2026 = fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2026, 11, 31) })
    fc.assert(
      fc.property(inicio2026, fc.integer({ min: 1, max: 20000 }), (ms, m) => {
        const i = new Date(ms)
        const fim = adicionarMinutosUteis(i, m, comercial)
        return msUteisEntre(i, fim, comercial) === m * 60_000
      }),
      { numRuns: 300, seed: 42 },
    )
  })

  it('13: janela que cruza a meia-noite', () => {
    const cal = jornada({
      horarios: [
        { diaSemana: 1, inicioMin: 1320, fimMin: 1440 },
        { diaSemana: 2, inicioMin: 0, fimMin: 360 },
      ],
    })
    expect(somar('2026-10-27T02:00:00Z', 180, cal)).toBe('2026-10-27T05:00:00.000Z')
  })

  it('14: dias de horário de verão têm 23 h e 25 h', () => {
    const cal = jornada({
      timezone: 'America/New_York',
      horarios: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, inicioMin: 0, fimMin: 1440 })),
    })
    const horas = (a: string, b: string) => msUteisEntre(new Date(a), new Date(b), cal) / 3_600_000
    expect(horas('2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z')).toBe(23)
    expect(horas('2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z')).toBe(25)
  })

  it('15: preserva segundos e milissegundos', () => {
    expect(somar('2026-10-26T11:00:30.500Z', 1, comercial)).toBe('2026-10-26T11:01:30.500Z')
  })

  it('16: jornada sem horários dá erro', () => {
    const cal = jornada({ horarios: [] })
    expect(() => adicionarMsUteis(new Date('2026-10-26T12:00:00Z'), 60_000, cal)).toThrow(ErroCalendarioSla)
  })

  it('17: janelas sobrepostas ou fim <= início dão erro', () => {
    const sobrepostas = jornada({
      horarios: [
        { diaSemana: 1, inicioMin: 480, fimMin: 720 },
        { diaSemana: 1, inicioMin: 700, fimMin: 800 },
      ],
    })
    const invertida = jornada({ horarios: [{ diaSemana: 1, inicioMin: 720, fimMin: 480 }] })
    const t = new Date('2026-10-26T12:00:00Z')
    expect(() => adicionarMsUteis(t, 60_000, sobrepostas)).toThrow(ErroCalendarioSla)
    expect(() => adicionarMsUteis(t, 60_000, invertida)).toThrow(ErroCalendarioSla)
  })

  it('18: 16.200 min terminam em 2026-12-04T21:00Z em menos de 50 ms', () => {
    const inicio = performance.now()
    const resultado = somar('2026-10-26T11:00:00Z', 16_200, comercial)
    expect(performance.now() - inicio).toBeLessThan(50)
    expect(resultado).toBe('2026-12-04T21:00:00.000Z')
  })

  it('28: adicionarDiasUteis pula fim de semana e feriado', () => {
    const sexta = new Date('2026-10-23T15:00:00Z')
    expect(iso(adicionarDiasUteis(sexta, 1, comercial))).toBe('2026-10-26T15:00:00.000Z')
    const cal = jornada({ feriados: new Set(['2026-10-26']) })
    expect(iso(adicionarDiasUteis(sexta, 1, cal))).toBe('2026-10-27T15:00:00.000Z')
  })
})
