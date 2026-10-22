import { buscaApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { naoAutenticado } from '../../lib/erros'
import * as service from './service'

export const rotasBusca: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.buscar.metodo,
    url: c.buscar.caminho,
    schema: {
      tags: ['Busca'],
      summary: 'Busca global: chamados, artigos, ativos e pessoas',
      querystring: c.buscar.query,
      response: { 200: c.buscar.resposta },
    },
    config: { acesso: 'autenticado', rateLimit: { max: 60, timeWindow: '1 minute' } },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.buscar(req.query, req.usuario)
    },
  })
}
