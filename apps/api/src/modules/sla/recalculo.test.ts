import { describe, expect, it } from 'vitest'
import type { CalendarioSla, Horario } from './calendario'
import { type EntradaSla, recalcularSla } from './recalculo'

const util: Horario[] = [1, 2, 3, 4, 5].flatMap((diaSemana) => [
  { diaSemana, inicioMin: 480, fimMin: 720 },
  { diaSemana, inicioMin: 780, fimMin: 1080 },
])

function jornada(extra: Partial<CalendarioSla> = {}): CalendarioSla {
  return {
    timezone: 'America/Sao_Paulo',
    ininterrupta: false,
    horarios: util,
    feriados: new Set(),
    feriadosRecorrentes: new Set(),
    ...extra,
  }
}

const comercial = jornada()
const ininterrupta = jornada({ ininterrupta: true, horarios: [] })
const d = (s: string) => new Date(s)
const iso = (x: Date | null) => (x === null ? null : x.toISOString())

// 2026-10-26 é segunda-feira; janelas locais em UTC: 11:00–15:00 e 16:00–21:00
const ABERTURA = d('2026-10-26T11:00:00Z')

function entrada(extra: Partial<EntradaSla> = {}): EntradaSla {
  return {
    abertoEm: ABERTURA,
    slaRespostaMin: null,
    slaSolucaoMin: 240,
    primeiraRespostaEm: null,
    concluidoEm: null,
    pausas: [],
    alertaPct: 80,
    ...extra,
  }
}

describe('recalcularSla', () => {
  it('19: pausa de 1h empurra o prazo', () => {
    const r = recalcularSla(
      entrada({ pausas: [{ inicio: d('2026-10-26T12:00:00Z'), fim: d('2026-10-26T13:00:00Z') }] }),
      comercial,
    )
    expect(iso(r.prazoSolucaoEm)).toBe('2026-10-26T17:00:00.000Z')
    expect(r.slaPausadoSeg).toBe(3600)
  })

  it('20: pausa no fim de semana não conta', () => {
    const r = recalcularSla(
      entrada({ pausas: [{ inicio: d('2026-10-24T13:00:00Z'), fim: d('2026-10-25T13:00:00Z') }] }),
      comercial,
    )
    expect(r.slaPausadoSeg).toBe(0)
    expect(iso(r.prazoSolucaoEm)).toBe('2026-10-26T15:00:00.000Z')
  })

  it('21a: pausa em curso antes do prazo deixa prazo e alerta em null', () => {
    const r = recalcularSla(entrada({ pausas: [{ inicio: d('2026-10-26T12:00:00Z'), fim: null }] }), comercial)
    expect(r.prazoSolucaoEm).toBeNull()
    expect(r.alertaSolucaoEm).toBeNull()
  })

  it('21b: pausa em curso depois do prazo não desvence', () => {
    const r = recalcularSla(entrada({ pausas: [{ inicio: d('2026-10-26T16:00:00Z'), fim: null }] }), comercial)
    expect(iso(r.prazoSolucaoEm)).toBe('2026-10-26T15:00:00.000Z')
  })

  it('22: conclusão antes e depois do prazo', () => {
    expect(recalcularSla(entrada({ concluidoEm: d('2026-10-26T14:00:00Z') }), comercial).slaSolucaoCumprido).toBe(true)
    expect(recalcularSla(entrada({ concluidoEm: d('2026-10-26T16:30:00Z') }), comercial).slaSolucaoCumprido).toBe(false)
  })

  it('23: 24x7 com pausa e conclusão tardia', () => {
    const r = recalcularSla(
      entrada({
        slaSolucaoMin: 60,
        concluidoEm: d('2026-10-26T14:30:00Z'),
        pausas: [{ inicio: d('2026-10-26T13:00:00Z'), fim: d('2026-10-26T14:00:00Z') }],
      }),
      ininterrupta,
    )
    expect(iso(r.prazoSolucaoEm)).toBe('2026-10-26T13:00:00.000Z')
    expect(r.slaSolucaoCumprido).toBe(false)
  })

  it('24: SLA de resposta cumprido, violado e sem resposta', () => {
    const resposta = (primeiraRespostaEm: Date | null) =>
      recalcularSla(entrada({ slaRespostaMin: 60, slaSolucaoMin: null, primeiraRespostaEm }), comercial)
        .slaRespostaCumprido
    expect(resposta(d('2026-10-26T11:59:00Z'))).toBe(true)
    expect(resposta(d('2026-10-26T12:01:00Z'))).toBe(false)
    expect(resposta(null)).toBeNull()
  })

  it('25: alerta em alertaPct da meta', () => {
    const r = recalcularSla(entrada({ slaSolucaoMin: 100, slaRespostaMin: 100, alertaPct: 80 }), ininterrupta)
    expect(r.alertaSolucaoEm?.getTime()).toBe(ABERTURA.getTime() + 80 * 60_000)
    expect(r.alertaRespostaEm?.getTime()).toBe(ABERTURA.getTime() + 80 * 60_000)
  })
})
