import { leiturasApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { naoAutenticado } from '../../lib/erros'
import * as service from './service'

const tags = ['Leituras']

export const rotasLeituras: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.marcar.metodo,
    url: c.marcar.caminho,
    schema: {
      tags,
      summary: 'Marca o chamado como lido até um assentamento (monotônico)',
      params: c.marcar.params,
      body: c.marcar.body,
      response: { 200: c.marcar.resposta },
    },
    config: { acesso: 'autenticado', rateLimit: { max: 120, timeWindow: '1 minute' } },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.marcarLeitura(req.params.id, req.body.assentamentoId, req.usuario)
    },
  })

  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Quem já leu o chamado ("Visto por")',
      params: c.listar.params,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.listarLeituras(req.params.id, req.usuario)
    },
  })
}
