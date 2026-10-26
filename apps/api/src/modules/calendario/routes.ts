import { calendarioApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { naoAutenticado } from '../../lib/erros'
import * as service from './service'

const tags = ['Calendário']

export const rotasCalendario: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Eventos do calendário de chamados',
      querystring: c.listar.query,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'chamado.atender' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.listarCalendario(req.usuario, req.query)
    },
  })
}
