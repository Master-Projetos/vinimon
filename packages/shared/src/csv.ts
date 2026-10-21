/** BOM UTF-8 para o Excel abrir o CSV com acentuação correta. */
export const BOM_CSV = '﻿'

/** S82: célula que começa com fórmula ganha apóstrofo antes do valor. */
const INICIO_PERIGOSO = /^[=+\-@\t\r]/

export function celulaCsv(v: unknown): string {
  const texto = String(v ?? '')
  const neutro = INICIO_PERIGOSO.test(texto) ? `'${texto}` : texto

  if (/[";\r\n]/.test(neutro)) return `"${neutro.replaceAll('"', '""')}"`
  return neutro
}

export function linhaCsv(valores: readonly unknown[]): string {
  return `${valores.map(celulaCsv).join(';')}\r\n`
}
