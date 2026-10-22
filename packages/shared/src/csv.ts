/** BOM para o Excel abrir o CSV em UTF-8. */
export const BOM_CSV = '﻿'

/** Escapa uma célula: neutraliza injeção de fórmula (prefixo `'`) e aspas, só envolvendo em aspas quando preciso. */
export function celulaCsv(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = v instanceof Date ? v.toISOString() : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export const linhaCsv = (valores: readonly unknown[]): string => `${valores.map(celulaCsv).join(';')}\r\n`
