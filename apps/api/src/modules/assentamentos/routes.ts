import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import { naoAutenticado } from '../../lib/erros'
import { assentamentosApi as c } from './schemas'
import * as service from './service'

const tags = ['Assentamentos']

export const rotasAssentamentos: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Lista a timeline do chamado (o interno só para a equipe)',
      params: c.listar.params,
      querystring: c.listar.query,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.listarAssentamentos(req.params.id, req.query, req.usuario)
    },
  })

  app.route({
    method: c.comentar.metodo,
    url: c.comentar.caminho,
    schema: {
      tags,
      summary: 'Comenta no chamado (idempotente por clienteId)',
      params: c.comentar.params,
      body: c.comentar.body,
      response: { 200: c.comentar.resposta, 201: c.comentar.resposta },
    },
    config: { acesso: 'chamado.comentar', rateLimit: { max: 30, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const { criado, resposta } = await service.comentar(req.params.id, req.body, contextoDe(req), req.log)
      return reply.code(criado ? 201 : 200).send(resposta)
    },
  })
}
