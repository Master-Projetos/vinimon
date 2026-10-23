import type { IncomingMessage } from 'node:http'
import proxyAddr from '@fastify/proxy-addr'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { env } from '../env'

const t = env.TRUST_PROXY
/** Mesma regra de confiança do `trustProxy` do Fastify (TRUST_PROXY já validado em `env.ts`). */
const confianca =
  typeof t === 'boolean' ? () => t : typeof t === 'number' ? (_: string, i: number) => i < t : proxyAddr.compile(t)

/** IP do cliente, pelo mesmo critério da API. */
export const ipDoHandshake = (req: IncomingMessage): string => proxyAddr(req, confianca)

/** 30 conexões por minuto por IP (§3.7). */
const limiteConexoes = new RateLimiterMemory({ points: 30, duration: 60 })

/** `allowRequest` do Socket.IO: Origin igual a APP_ORIGIN (S36) e limite por IP. */
export async function permitirHandshake(req: IncomingMessage): Promise<boolean> {
  if (req.headers.origin !== env.APP_ORIGIN) return false
  try {
    await limiteConexoes.consume(ipDoHandshake(req))
    return true
  } catch {
    return false
  }
}

/** Erro de handshake que chega ao cliente em `connect_error.data.codigo`. */
export type CodigoErroHandshake = 'NAO_AUTENTICADO' | 'LIMITE_CONEXOES' | 'ERRO_INTERNO'
export const erroRt = (codigo: CodigoErroHandshake) => Object.assign(new Error(codigo), { data: { codigo } })

/** Só cookie: qualquer `Authorization` (Bearer ou outro) no handshake é recusado (S91). */
export const temCredencialIndevida = (req: IncomingMessage, auth: unknown): boolean =>
  req.headers.authorization !== undefined || (typeof auth === 'object' && auth !== null && Object.keys(auth).length > 0)
