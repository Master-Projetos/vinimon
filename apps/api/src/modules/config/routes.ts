import { configApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import * as service from './service'

const tags = ['Configuração']

export const rotasConfig: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: { tags, summary: 'Obtém a configuração do sistema', response: { 200: c.obter.resposta } },
    config: { acesso: 'config.gerenciar' },
    handler: () => service.obterConfigApi(),
  })

  app.route({
    method: c.atualizar.metodo,
    url: c.atualizar.caminho,
    schema: {
      tags,
      summary: 'Altera a configuração do sistema',
      body: c.atualizar.body,
      response: { 200: c.atualizar.resposta },
    },
    config: { acesso: 'config.gerenciar' },
    handler: (req) => service.atualizarConfig(req.body, contextoDe(req)),
  })
}
