import { randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { hash, verify } from '@node-rs/argon2'

/** OWASP mínimo. O padrão da lib já é Argon2id (não importe o const enum Algorithm). */
export const ARGON2_PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const

const scryptAsync = promisify(scrypt) as (senha: string, salt: string, tamanho: number) => Promise<Buffer>
const LEGADO = /^([0-9a-f]{32}):([0-9a-f]{128})$/
const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/
let hashFicticio: Promise<string> | undefined

export const hashSenha = (senha: string): Promise<string> => hash(senha, ARGON2_PARAMS)

export function precisaRehash(armazenado: string): boolean {
  const m = PHC.exec(armazenado)
  if (!m) return true
  return (
    Number(m[1]) !== ARGON2_PARAMS.memoryCost ||
    Number(m[2]) !== ARGON2_PARAMS.timeCost ||
    Number(m[3]) !== ARGON2_PARAMS.parallelism
  )
}

/** Aceita argon2id e o legado "salt:hash" (scrypt, keylen 64) da v1. `null` verifica contra hash fictício (anti-enumeração). */
export async function verificarSenha(
  senha: string,
  armazenado: string | null,
): Promise<{ ok: boolean; precisaRehash: boolean }> {
  if (armazenado === null) {
    hashFicticio ??= hashSenha(randomUUID())
    await verify(await hashFicticio, senha).catch(() => false)
    return { ok: false, precisaRehash: false }
  }
  const legado = LEGADO.exec(armazenado)
  if (legado) {
    const saltHex = legado[1] ?? ''
    const hashHex = legado[2] ?? ''
    // v1 usava a STRING hex do salt como salt (não os bytes), com N=16384, r=8, p=1 (padrão do Node).
    const calculado = await scryptAsync(senha, saltHex, 64)
    const ok = timingSafeEqual(calculado, Buffer.from(hashHex, 'hex'))
    return { ok, precisaRehash: ok }
  }
  if (!armazenado.startsWith('$argon2id$')) return { ok: false, precisaRehash: false }
  const ok = await verify(armazenado, senha).catch(() => false)
  return { ok, precisaRehash: ok && precisaRehash(armazenado) }
}
