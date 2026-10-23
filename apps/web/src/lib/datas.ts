import { CONFIG_PADRAO } from '@vinimon/shared'
import { format, formatDistance, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/** Fuso de exibição padrão: `sistema.fusoHorario` da configuração pública. */
export const FUSO_PADRAO: string = CONFIG_PADRAO['sistema.fusoHorario']

/**
 * Devolve um Date cujos campos locais são o relógio de parede do fuso informado.
 * Assim as funções do date-fns (format, isSameDay, formatDistance) trabalham sobre a hora do fuso,
 * e não sobre o fuso do navegador.
 */
function noFuso(d: Date, fuso: string): Date {
  const formatador = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const parte of formatador.formatToParts(d)) p[parte.type] = parte.value
  return new Date(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  )
}

/** Dia anterior ao dia de `a` (calendário do fuso já aplicado). */
function diaAnterior(a: Date): Date {
  return new Date(a.getFullYear(), a.getMonth(), a.getDate() - 1)
}

export function formatarData(d: Date, fuso: string = FUSO_PADRAO): string {
  return format(noFuso(d, fuso), 'dd/MM/yyyy', { locale: ptBR })
}

export function formatarHora(d: Date, fuso: string = FUSO_PADRAO): string {
  return format(noFuso(d, fuso), 'HH:mm', { locale: ptBR })
}

export function formatarDataHora(d: Date, fuso: string = FUSO_PADRAO): string {
  return format(noFuso(d, fuso), 'dd/MM/yyyy HH:mm', { locale: ptBR })
}

/** Hoje: hora. Ontem: "Ontem". Mesmo ano: "12 out.". Outro ano: data completa. */
export function formatarCurto(d: Date, agora: Date, fuso: string = FUSO_PADRAO): string {
  const x = noFuso(d, fuso)
  const a = noFuso(agora, fuso)
  if (isSameDay(x, a)) return format(x, 'HH:mm', { locale: ptBR })
  if (isSameDay(x, diaAnterior(a))) return 'Ontem'
  if (x.getFullYear() === a.getFullYear()) return format(x, 'd MMM', { locale: ptBR })
  return format(x, 'dd/MM/yyyy', { locale: ptBR })
}

/** Menos de um minuto: "agora". Depois, distância em pt-BR: "há 3 horas", "em 2 dias". */
export function formatarRelativo(d: Date, agora: Date, fuso: string = FUSO_PADRAO): string {
  if (Math.abs(agora.getTime() - d.getTime()) < 60_000) return 'agora'
  return formatDistance(noFuso(d, fuso), noFuso(agora, fuso), { addSuffix: true, locale: ptBR })
}

/** Duração em minutos: 45 -> "45 min"; 200 -> "3 h 20 min"; 180 -> "3 h". */
export function formatarDuracao(minutos: number): string {
  const total = Math.max(0, Math.round(minutos))
  const horas = Math.floor(total / 60)
  const resto = total % 60
  if (horas === 0) return `${resto} min`
  if (resto === 0) return `${horas} h`
  return `${horas} h ${resto} min`
}

/** Cabeçalho de grupo em listas: "Hoje", "Ontem" ou a data. */
export function rotuloSeparador(d: Date, agora: Date, fuso: string = FUSO_PADRAO): string {
  const x = noFuso(d, fuso)
  const a = noFuso(agora, fuso)
  if (isSameDay(x, a)) return 'Hoje'
  if (isSameDay(x, diaAnterior(a))) return 'Ontem'
  return format(x, 'dd/MM/yyyy', { locale: ptBR })
}
