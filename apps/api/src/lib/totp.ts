import { randomBytes } from 'node:crypto'
import { generateSecret, generateURI, verify } from 'otplib'
import { sha256Hex } from './cripto'

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const gerarSegredo = (): string => generateSecret()

export const uriOtpauth = (d: { issuer: string; label: string; secret: string }): string => generateURI(d)

/** Código de 6 dígitos com janela de ±30 s. `ultimoPasso` bloqueia o reuso do mesmo passo (replay). */
export async function verificarCodigo(
  secret: string,
  codigo: string,
  ultimoPasso: number | null,
): Promise<{ valido: true; passo: number } | { valido: false; passo: null }> {
  if (!/^\d{6}$/.test(codigo)) return { valido: false, passo: null }
  const r = await verify({ secret, token: codigo, epochTolerance: 30, afterTimeStep: ultimoPasso ?? undefined })
  return r.valid && 'timeStep' in r ? { valido: true, passo: r.timeStep } : { valido: false, passo: null }
}

/** 10 códigos `XXXX-XXXX-XXXX-XXXX` em base32 Crockford, 80 bits cada. */
export function gerarCodigosRecuperacao(): string[] {
  return Array.from({ length: 10 }, () => {
    const bytes = randomBytes(16)
    const chars = Array.from(bytes, (b) => CROCKFORD[b % 32]).join('')
    return chars.match(/.{4}/g)?.join('-') ?? chars
  })
}

/** Normaliza (sem hífens, espaços, maiúsculo) e devolve o sha256 hex, que é o que fica no banco. */
export const hashCodigo = (codigo: string): string => sha256Hex(codigo.replace(/[-\s]/g, '').toUpperCase())
