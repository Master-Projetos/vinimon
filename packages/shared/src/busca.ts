/** Texto da busca sem acento e sem maiúsculas, com espaços colapsados e no máximo 100 caracteres. */
export const normalizarBusca = (texto: string): string =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100).trim()

/** Até 8 tokens de 2 a 30 caracteres, só letras e dígitos. */
export const tokensBusca = (texto: string): string[] =>
  normalizarBusca(texto)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2 && token.length <= 30)
    .slice(0, 8)

/** Número exato de chamado (`123` ou `#123`), ou nulo quando a busca não é um número. */
export const idChamadoExato = (q: string): number | null => {
  const m = /^#?(\d{1,9})$/.exec(q.trim())
  return m ? Number(m[1]) : null
}
