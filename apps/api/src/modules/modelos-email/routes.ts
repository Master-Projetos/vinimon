import { modelosEmailApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import * as service from './service'

const tags = ['Modelos de e-mail']

export const rotasModelosEmail: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: { tags, summary: 'Lista modelos de e-mail', response: { 200: c.listar.resposta } },
    config: { acesso: 'config.gerenciar' },
    handler: () => service.listarModelosEmail(),
  })

  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: { tags, summary: 'Obtém modelo de e-mail', params: c.obter.params, response: { 200: c.obter.resposta } },
    config: { acesso: 'config.gerenciar' },
    handler: (req) => service.obterModeloEmail(req.params.evento),
  })

  app.route({
    method: c.atualizar.metodo,
    url: c.atualizar.caminho,
    schema: {
      tags,
      summary: 'Altera modelo de e-mail',
      params: c.atualizar.params,
      body: c.atualizar.body,
      response: { 200: c.atualizar.resposta },
    },
    config: { acesso: 'config.gerenciar' },
    handler: (req) => service.atualizarModeloEmail(req.params.evento, req.body, contextoDe(req)),
  })

  app.route({
    method: c.enviarTeste.metodo,
    url: c.enviarTeste.caminho,
    schema: {
      tags,
      summary: 'Envia e-mail de teste',
      body: c.enviarTeste.body,
      response: { 200: c.enviarTeste.resposta },
    },
    config: { acesso: 'config.gerenciar', rateLimit: { max: 5, timeWindow: '1 hour' } },
    handler: (req) => service.enviarTesteEmail(req.body),
  })
}
