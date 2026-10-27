import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import { listasEmailApi as c } from './schemas'
import * as service from './service'

const tags = ['Listas de distribuição']

export const rotasListasEmail: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Lista listas de distribuição',
      querystring: c.listar.query,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: (req) => service.listarListasEmail(req.query),
  })

  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: {
      tags,
      summary: 'Obtém lista de distribuição',
      params: c.obter.params,
      response: { 200: c.obter.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: (req) => service.obterListaEmail(req.params.id),
  })

  app.route({
    method: c.criar.metodo,
    url: c.criar.caminho,
    schema: { tags, summary: 'Cria lista de distribuição', body: c.criar.body, response: { 201: c.criar.resposta } },
    config: { acesso: 'cadastro.gerenciar' },
    handler: async (req, reply) => reply.code(201).send(await service.criarListaEmail(req.body, contextoDe(req))),
  })

  app.route({
    method: c.atualizar.metodo,
    url: c.atualizar.caminho,
    schema: {
      tags,
      summary: 'Atualiza lista de distribuição',
      params: c.atualizar.params,
      body: c.atualizar.body,
      response: { 200: c.atualizar.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: (req) => service.atualizarListaEmail(req.params.id, req.body, contextoDe(req)),
  })

  app.route({
    method: c.excluir.metodo,
    url: c.excluir.caminho,
    schema: {
      tags,
      summary: 'Exclui lista de distribuição',
      params: c.excluir.params,
      response: { 204: c.excluir.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: async (req, reply) => {
      await service.excluirListaEmail(req.params.id, contextoDe(req))
      return reply.code(204).send()
    },
  })

  app.route({
    method: c.vincularModelo.metodo,
    url: c.vincularModelo.caminho,
    schema: {
      tags,
      summary: 'Define as listas de distribuição de um modelo de e-mail',
      params: c.vincularModelo.params,
      body: c.vincularModelo.body,
      response: { 200: c.vincularModelo.resposta },
    },
    config: { acesso: 'config.gerenciar' },
    handler: (req) => service.vincularListasModelo(req.params.evento, req.body, contextoDe(req)),
  })
}
