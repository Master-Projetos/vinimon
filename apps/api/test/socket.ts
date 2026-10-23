import type { AddressInfo } from 'node:net'
import { io as ioc, type Socket } from 'socket.io-client'
import type { App } from '../src/app'
import { ORIGEM } from './ajudantes'

/** Conecta um cliente ao servidor de teste (sobe o listen na primeira chamada). */
export async function conectar(
  app: App,
  cookie: string | undefined,
  origin: string | null = ORIGEM,
  extra: { authorization?: string } = {},
): Promise<Socket> {
  if (!app.server.listening) await app.listen({ port: 0, host: '127.0.0.1' })
  const { port } = app.server.address() as AddressInfo
  const extraHeaders: Record<string, string> = {}
  if (cookie !== undefined) extraHeaders.cookie = cookie
  if (origin !== null) extraHeaders.origin = origin
  if (extra.authorization !== undefined) extraHeaders.authorization = extra.authorization
  return ioc(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    extraHeaders,
    forceNew: true,
    reconnection: false,
  })
}

export function esperarEvento<T = unknown>(s: Socket, evento: string, ms = 5000): Promise<T> {
  return new Promise((resolver, rejeitar) => {
    const timer = setTimeout(() => rejeitar(new Error(`timeout esperando "${evento}"`)), ms)
    s.once(evento, (dados: T) => {
      clearTimeout(timer)
      resolver(dados)
    })
  })
}

/** Resolve se o evento NÃO chegar em `ms`; rejeita se chegar. */
export function naoRecebe(s: Socket, evento: string, ms = 300): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const aoReceber = () => rejeitar(new Error(`recebeu "${evento}" indevidamente`))
    s.once(evento, aoReceber)
    setTimeout(() => {
      s.off(evento, aoReceber)
      resolver()
    }, ms)
  })
}

/** Resolve com o erro do `connect_error`, ou rejeita se conectar. */
export function esperarErroConexao(s: Socket, ms = 2000): Promise<Error & { data?: { codigo?: string } }> {
  return new Promise((resolver, rejeitar) => {
    const timer = setTimeout(() => rejeitar(new Error('sem connect_error')), ms)
    s.once('connect', () => {
      clearTimeout(timer)
      rejeitar(new Error('conectou, deveria ser recusado'))
    })
    s.once('connect_error', (err) => {
      clearTimeout(timer)
      resolver(err)
    })
  })
}

export function esperarConectar(s: Socket, ms = 2000): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    if (s.connected) return resolver()
    const timer = setTimeout(() => rejeitar(new Error('timeout ao conectar')), ms)
    s.once('connect', () => {
      clearTimeout(timer)
      resolver()
    })
    s.once('connect_error', (err) => {
      clearTimeout(timer)
      rejeitar(err)
    })
  })
}
