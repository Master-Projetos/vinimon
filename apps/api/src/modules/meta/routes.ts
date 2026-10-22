import { metaApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import * as service from './service'

const tags = ['Meta']

export const rotasMeta: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: { tags, summary: 'Catálogos de apoio ao front', response: { 200: c.obter.resposta } },
    config: { acesso: 'autenticado' },
    handler: (req) => service.obterMeta(contextoDe(req).usuario),
  })
}
