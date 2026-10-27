import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import { cadastroApi as c } from './schemas'
import * as service from './service'

const tags = ['Cadastro']

export const rotasCadastro: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.solicitar.metodo,
    url: c.solicitar.caminho,
    schema: {
      tags,
      summary: 'Pedido público de auto-cadastro',
      body: c.solicitar.body,
      response: { 202: c.solicitar.resposta },
    },
    config: { acesso: 'publico', rateLimit: { max: 3, timeWindow: '1 hour' } },
    handler: async (req, reply) => {
      await service.solicitarCadastro(req.body)
      return reply.code(202).send({ mensagem: service.MENSAGEM_CADASTRO })
    },
  })

  app.route({
    method: c.confirmar.metodo,
    url: c.confirmar.caminho,
    schema: {
      tags,
      summary: 'Confirma o e-mail do pedido de cadastro',
      body: c.confirmar.body,
      response: { 204: c.confirmar.resposta },
    },
    config: { acesso: 'publico', rateLimit: { max: 10, timeWindow: '1 hour' } },
    handler: async (req, reply) => {
      await service.confirmarCadastro(req.body)
      return reply.code(204).send()
    },
  })

  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Lista pedidos de cadastro',
      querystring: c.listar.query,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'usuario.gerenciar' },
    handler: (req) => service.listarCadastros(req.query),
  })

  app.route({
    method: c.aprovar.metodo,
    url: c.aprovar.caminho,
    schema: {
      tags,
      summary: 'Aprova cadastro e cria o usuário',
      params: c.aprovar.params,
      response: { 200: c.aprovar.resposta },
    },
    config: { acesso: 'usuario.gerenciar' },
    handler: (req) => service.aprovarCadastro(req.params.id, contextoDe(req)),
  })
}
