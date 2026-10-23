import { describe, expect, it } from 'vitest'
import {
  FUSO_PADRAO,
  formatarCurto,
  formatarData,
  formatarDataHora,
  formatarDuracao,
  formatarHora,
  formatarRelativo,
  rotuloSeparador,
} from './datas'

// Horários em America/Sao_Paulo (UTC-03:00, sem horário de verão desde 2019).
const SP = 'America/Sao_Paulo'
const sp = (iso: string) => new Date(`${iso}-03:00`)

describe('datas', () => {
  it('usa America/Sao_Paulo como fuso padrão', () => {
    expect(FUSO_PADRAO).toBe(SP)
  })

  it('formata data e hora no fuso informado, não no do navegador', () => {
    // 02:30 UTC do dia 11 é 23:30 do dia 10 em São Paulo.
    const d = new Date('2026-10-11T02:30:00Z')
    expect(formatarData(d, SP)).toBe('10/10/2026')
    expect(formatarHora(d, SP)).toBe('23:30')
    expect(formatarDataHora(d, SP)).toBe('10/10/2026 23:30')
  })

  it('hoje mostra só a hora; ontem mostra "Ontem"', () => {
    const agora = sp('2026-10-22T15:00:00')
    expect(formatarCurto(sp('2026-10-22T09:05:00'), agora, SP)).toBe('09:05')
    expect(formatarCurto(sp('2026-10-21T18:00:00'), agora, SP)).toBe('Ontem')
    expect(rotuloSeparador(sp('2026-10-22T01:00:00'), agora, SP)).toBe('Hoje')
    expect(rotuloSeparador(sp('2026-10-21T23:59:00'), agora, SP)).toBe('Ontem')
  })

  it('virada de ano: 31/12 à noite é "Ontem" para 01/01 e a data completa tem o ano', () => {
    const agora = sp('2027-01-01T00:10:00')
    expect(formatarCurto(sp('2026-12-31T23:50:00'), agora, SP)).toBe('Ontem')
    expect(rotuloSeparador(sp('2026-12-31T23:50:00'), agora, SP)).toBe('Ontem')
    expect(formatarCurto(sp('2026-12-30T10:00:00'), agora, SP)).toBe('30/12/2026')
    expect(formatarCurto(sp('2026-06-01T10:00:00'), sp('2027-01-01T00:10:00'), SP)).toBe('01/06/2026')
    expect(formatarData(sp('2026-12-31T23:50:00'), SP)).toBe('31/12/2026')
  })

  it('formata duração em horas e minutos', () => {
    expect(formatarDuracao(200)).toBe('3 h 20 min')
    expect(formatarDuracao(45)).toBe('45 min')
    expect(formatarDuracao(180)).toBe('3 h')
  })

  it('relativo: agora, há X e em X', () => {
    const agora = sp('2026-10-22T15:00:00')
    expect(formatarRelativo(sp('2026-10-22T14:59:30'), agora, SP)).toBe('agora')
    expect(formatarRelativo(sp('2026-10-22T12:00:00'), agora, SP)).toBe('há cerca de 3 horas')
    expect(formatarRelativo(sp('2026-10-24T15:00:00'), agora, SP)).toBe('em 2 dias')
  })
})
