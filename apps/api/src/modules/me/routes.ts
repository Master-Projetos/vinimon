import { meApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import * as service from './service'

const tags = ['Me']

export const rotasMe: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.atualizar.metodo,
    url: c.atualizar.caminho,
    schema: {
      tags,
      summary: 'Atualiza o próprio perfil',
      body: c.atualizar.body,
      response: { 200: c.atualizar.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => service.atualizarMe(req.body, contextoDe(req)),
  })
}
