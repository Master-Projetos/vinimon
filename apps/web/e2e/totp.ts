import { createHmac } from 'node:crypto'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Código TOTP (RFC 6238, 6 dígitos, passo de 30 s) para um segredo em base32. Só para os testes E2E. */
export function totp(segredo: string, agora = Date.now()): string {
  let bits = ''
  for (const ch of segredo.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, '0')
  const chave = Buffer.from(bits.match(/.{8}/g)?.map((b) => Number.parseInt(b, 2)) ?? [])
  const c = Buffer.alloc(8)
  c.writeBigUInt64BE(BigInt(Math.floor(agora / 30_000)))
  const h = createHmac('sha1', chave).update(c).digest()
  const o = (h[h.length - 1] ?? 0) & 0xf
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
