import { cadastroApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoAnonimo, contextoDe } from '../../lib/contexto'
import * as service from './service'

const tags = ['Cadastro']

export const rotasCadastro: FastifyPluginAsyncZod = async (app) => {
  // Público, 3 por hora por IP (A14). A resposta é sempre a mesma; a config e a existência de contas não vazam.
  app.route({
    method: c.solicitar.metodo,
    url: c.solicitar.caminho,
    schema: {
      tags,
      summary: 'Solicita o auto-cadastro (resposta sempre genérica)',
      body: c.solicitar.body,
      response: { 202: c.solicitar.resposta },
    },
    config: { acesso: 'publico', rateLimit: { max: 3, timeWindow: '1 hour' } },
    handler: async (req, reply) => reply.code(202).send(await service.solicitar(req.body)),
  })

  app.route({
    method: c.confirmar.metodo,
    url: c.confirmar.caminho,
    schema: {
      tags,
      summary: 'Confirma o e-mail do auto-cadastro',
      body: c.confirmar.body,
      response: { 200: c.confirmar.resposta },
    },
    config: { acesso: 'publico', rateLimit: { max: 10, timeWindow: '1 hour' } },
    handler: (req) => service.confirmar(req.body, contextoAnonimo(req)),
  })

  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Lista cadastros confirmados aguardando aprovação',
      querystring: c.listar.query,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'usuario.gerenciar' },
    handler: (req) => service.listarPendentes(req.query),
  })

  app.route({
    method: c.aprovar.metodo,
    url: c.aprovar.caminho,
    schema: {
      tags,
      summary: 'Aprova o cadastro e envia o link de definição de senha',
      params: c.aprovar.params,
      response: { 201: c.aprovar.resposta },
    },
    config: { acesso: 'usuario.gerenciar' },
    handler: async (req, reply) => reply.code(201).send(await service.aprovar(req.params.id, contextoDe(req))),
  })

  app.route({
    method: c.rejeitar.metodo,
    url: c.rejeitar.caminho,
    schema: {
      tags,
      summary: 'Rejeita o cadastro pendente',
      params: c.rejeitar.params,
      response: { 204: c.rejeitar.resposta },
    },
    config: { acesso: 'usuario.gerenciar' },
    handler: async (req, reply) => {
      await service.rejeitar(req.params.id, contextoDe(req))
      return reply.code(204).send()
    },
  })
}
