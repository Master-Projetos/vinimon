import { auditoriaApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import * as service from './service'

const tags = ['Auditoria']

export const rotasAuditoria: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Lista a trilha de auditoria',
      querystring: c.listar.query,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'auditoria.ver' },
    handler: (req) => service.listarAuditoria(req.query),
  })
}
