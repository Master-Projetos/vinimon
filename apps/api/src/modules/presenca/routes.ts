import { presencaApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { naoAutenticado } from '../../lib/erros'
import * as service from './service'

export const rotasPresenca: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.definir.metodo,
    url: c.definir.caminho,
    schema: {
      tags: ['Presença'],
      summary: 'Define (ou limpa) o estado manual de presença, por até 7 dias',
      body: c.definir.body,
      response: { 200: c.definir.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.definirPresencaManual(req.usuario.id, req.body)
    },
  })
}
