import type { FastifyRequest } from 'fastify'
import { naoAutenticado } from './erros'
import type { UsuarioSessao } from './sessao'

export interface Contexto {
  usuario: UsuarioSessao | null
  ip: string | null
  userAgent: string | null
  requestId: string | null
}
export interface ContextoUsuario extends Contexto {
  usuario: UsuarioSessao
}

export const contextoAnonimo = (req: FastifyRequest): Contexto => ({
  usuario: req.usuario,
  ip: req.ip,
  userAgent: req.headers['user-agent']?.slice(0, 256) ?? null,
  requestId: req.id,
})
export function contextoDe(req: FastifyRequest): ContextoUsuario {
  if (!req.usuario) throw naoAutenticado()
  return { ...contextoAnonimo(req), usuario: req.usuario }
}
export const CONTEXTO_SISTEMA: Contexto = { usuario: null, ip: null, userAgent: null, requestId: null }
