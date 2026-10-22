import { ESTADOS_SESSAO } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoAnonimo, contextoDe } from '../../lib/contexto'
import { csrfDaSessao, NOME_COOKIE, opcoesCookie, opcoesLimparCookie } from '../../lib/sessao'
import { authApi as c } from './schemas'
import * as service from './service'

const tags = ['Autenticação']

export const rotasAuth: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.entrar.metodo,
    url: c.entrar.caminho,
    schema: { tags, summary: 'Entrar', body: c.entrar.body, response: { 200: c.entrar.resposta } },
    config: { acesso: 'publico', rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const r = await service.entrar(req.body, { ...contextoAnonimo(req), ip: req.ip })
      reply.setCookie(NOME_COOKIE, r.token, opcoesCookie(r.expiraEm))
      return {
        estado: r.estado,
        csrf: csrfDaSessao(r.sessaoId),
        usuario: r.estado === 'ATIVA' ? await service.obterUsuarioMe(r.usuarioId) : null,
      }
    },
  })

  app.route({
    method: c.sessao.metodo,
    url: c.sessao.caminho,
    schema: { tags, summary: 'Sessão atual', response: { 200: c.sessao.resposta } },
    config: { acesso: 'autenticado', estados: ESTADOS_SESSAO },
    handler: async (req) => {
      const u = req.usuario
      if (!u) throw new Error('inalcançável: acesso autenticado garante usuário')
      return {
        estado: u.estado,
        csrf: csrfDaSessao(u.sessaoId),
        usuario: u.estado === 'ATIVA' ? await service.obterUsuarioMe(u.id) : null,
      }
    },
  })

  app.route({
    method: c.sair.metodo,
    url: c.sair.caminho,
    schema: { tags, summary: 'Sair', response: { 204: c.sair.resposta } },
    config: { acesso: 'autenticado', estados: ESTADOS_SESSAO },
    handler: async (req, reply) => {
      await service.sair(contextoDe(req))
      reply.clearCookie(NOME_COOKIE, opcoesLimparCookie())
      return reply.code(204).send()
    },
  })
}
