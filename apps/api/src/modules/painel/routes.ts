import { painelApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { naoAutenticado } from '../../lib/erros'
import * as service from './service'

export const rotasPainel: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: {
      tags: ['Painel'],
      summary: 'Indicadores do painel dentro do escopo do usuário',
      querystring: c.obter.query,
      response: { 200: c.obter.resposta },
    },
    config: { acesso: 'painel.ver' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.obterPainel(req.usuario, req.query)
    },
  })
}
