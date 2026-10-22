import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { env } from '../env'

const PREFIXO = 'v1'
const chave = () => Buffer.from(env.ENCRYPTION_KEY, 'base64')

/** AES-256-GCM. Formato: `v1:<iv b64>:<tag b64>:<texto cifrado b64>`. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave(), iv)
  const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return [PREFIXO, iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':')
}

/** Lança erro se o prefixo, o tamanho do IV/tag ou a autenticação não conferem. */
export function decifrar(valor: string): string {
  const [prefixo, iv, tag, ct, ...resto] = valor.split(':')
  if (prefixo !== PREFIXO || !iv || !tag || ct === undefined || resto.length > 0)
    throw new Error('Formato de texto cifrado inválido.')
  const ivBuf = Buffer.from(iv, 'base64')
  const tagBuf = Buffer.from(tag, 'base64')
  if (ivBuf.length !== 12 || tagBuf.length !== 16) throw new Error('Formato de texto cifrado inválido.')
  const d = createDecipheriv('aes-256-gcm', chave(), ivBuf)
  d.setAuthTag(tagBuf)
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8')
}

export const sha256Hex = (texto: string): string => createHash('sha256').update(texto).digest('hex')

/** HMAC com separação de propósito (nunca reutilize a mesma chave para usos diferentes). */
export function hmacProposito(proposito: string, valor: string): Buffer {
  const chaveDoProposito = createHmac('sha256', Buffer.from(env.CSRF_SECRET, 'base64'))
    .update(`vinimon:${proposito}`)
    .digest()
  return createHmac('sha256', chaveDoProposito).update(valor).digest()
}
