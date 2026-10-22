import { DateTime } from 'luxon'

export interface Horario {
  diaSemana: number
  inicioMin: number
  fimMin: number
} // 0=domingo; [inicio, fim) local; fim ≤ 1440
export interface CalendarioSla {
  timezone: string
  ininterrupta: boolean
  horarios: readonly Horario[]
  feriados: ReadonlySet<string> // 'yyyy-MM-dd' (não recorrentes)
  feriadosRecorrentes: ReadonlySet<string> // 'MM-dd'
}
export class ErroCalendarioSla extends Error {}

type Janela = readonly [number, number]
const LIMITE_DIAS = 3660
const cache = new WeakMap<CalendarioSla, Janela[][]>()

function janelasPorDia(cal: CalendarioSla): Janela[][] {
  const memo = cache.get(cal)
  if (memo) return memo
  const dias: Janela[][] = [[], [], [], [], [], [], []]
  for (const h of cal.horarios) {
    const lista = Number.isInteger(h.diaSemana) ? dias[h.diaSemana] : undefined
    if (lista === undefined) throw new ErroCalendarioSla('diaSemana inválido')
    if (!(h.inicioMin >= 0 && h.fimMin <= 1440 && h.fimMin > h.inicioMin))
      throw new ErroCalendarioSla('janela inválida')
    lista.push([h.inicioMin, h.fimMin])
  }
  for (const lista of dias) {
    lista.sort((a, b) => a[0] - b[0])
    for (let i = 1; i < lista.length; i++) {
      const atual = lista[i]
      const anterior = lista[i - 1]
      if (atual && anterior && atual[0] < anterior[1]) throw new ErroCalendarioSla('janelas sobrepostas')
    }
  }
  if (!cal.ininterrupta && dias.every((l) => l.length === 0)) throw new ErroCalendarioSla('jornada sem horários')
  cache.set(cal, dias)
  return dias
}

function instante(dia: DateTime, minuto: number): number {
  if (minuto >= 1440) return dia.plus({ days: 1 }).startOf('day').toMillis() // 24:00 = 00:00 do dia seguinte
  return dia.set({ hour: Math.floor(minuto / 60), minute: minuto % 60, second: 0, millisecond: 0 }).toMillis()
}

function ehFeriado(dia: DateTime, cal: Pick<CalendarioSla, 'feriados' | 'feriadosRecorrentes'>): boolean {
  return cal.feriados.has(dia.toFormat('yyyy-MM-dd')) || cal.feriadosRecorrentes.has(dia.toFormat('MM-dd'))
}

function janelasDoDia(dia: DateTime, dias: Janela[][], cal: CalendarioSla): Array<[number, number]> {
  if (ehFeriado(dia, cal)) return []
  const lista = dias[dia.weekday % 7] ?? [] // luxon 1=segunda…7=domingo → 0=domingo
  return lista.map(([i, f]): [number, number] => [instante(dia, i), instante(dia, f)])
}

export function msUteisEntre(inicio: Date, fim: Date, cal: CalendarioSla): number {
  const a = inicio.getTime()
  const b = fim.getTime()
  if (!(b > a)) return 0
  if (cal.ininterrupta) return b - a
  const dias = janelasPorDia(cal)
  let total = 0
  let dia = DateTime.fromMillis(a, { zone: cal.timezone }).startOf('day')
  for (let i = 0; dia.toMillis() < b; i++, dia = dia.plus({ days: 1 })) {
    if (i > LIMITE_DIAS * 10) throw new ErroCalendarioSla('intervalo longo demais')
    for (const [ji, jf] of janelasDoDia(dia, dias, cal)) {
      const x = Math.max(ji, a)
      const y = Math.min(jf, b)
      if (y > x) total += y - x
    }
  }
  return total
}

export function adicionarMsUteis(inicio: Date, ms: number, cal: CalendarioSla): Date {
  if (!Number.isFinite(ms) || ms < 0) throw new ErroCalendarioSla('duração inválida')
  if (ms === 0) return new Date(inicio.getTime())
  if (cal.ininterrupta) return new Date(inicio.getTime() + ms)
  const dias = janelasPorDia(cal)
  const a = inicio.getTime()
  let restante = ms
  let dia = DateTime.fromMillis(a, { zone: cal.timezone }).startOf('day')
  for (let i = 0; i < LIMITE_DIAS; i++, dia = dia.plus({ days: 1 })) {
    for (const [ji, jf] of janelasDoDia(dia, dias, cal)) {
      const x = Math.max(ji, a)
      if (x >= jf) continue
      if (restante <= jf - x) return new Date(x + restante) // pode terminar exatamente no fim da janela
      restante -= jf - x
    }
  }
  throw new ErroCalendarioSla('prazo além de 3660 dias')
}

export const minutosUteisEntre = (i: Date, f: Date, c: CalendarioSla) => Math.floor(msUteisEntre(i, f, c) / 60_000)
export const adicionarMinutosUteis = (i: Date, min: number, c: CalendarioSla) =>
  adicionarMsUteis(i, Math.round(min * 60_000), c)

/** Prazo de validação em dias úteis (seg–sex, exceto feriados), mantendo a hora local. */
export function adicionarDiasUteis(
  inicio: Date,
  dias: number,
  cal: Pick<CalendarioSla, 'timezone' | 'feriados' | 'feriadosRecorrentes'>,
): Date {
  let d = DateTime.fromJSDate(inicio, { zone: cal.timezone })
  let restantes = dias
  while (restantes > 0) {
    d = d.plus({ days: 1 })
    if (d.weekday <= 5 && !ehFeriado(d, cal)) restantes -= 1
  }
  return d.toJSDate()
}
