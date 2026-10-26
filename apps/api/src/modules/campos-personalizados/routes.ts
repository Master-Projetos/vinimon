import { camposPersonalizadosApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import * as service from './service'

const tags = ['Campos personalizados']

export const rotasCamposPersonalizados: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Lista campos personalizados',
      querystring: c.listar.query,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: (req) => service.listarCampos(req.query),
  })

  // Antes de /:id, para "aplicaveis" não ser lido como id.
  app.route({
    method: c.aplicaveis.metodo,
    url: c.aplicaveis.caminho,
    schema: {
      tags,
      summary: 'Campos aplicáveis a um problema',
      querystring: c.aplicaveis.query,
      response: { 200: c.aplicaveis.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => service.listarAplicaveis(req.query, contextoDe(req)),
  })

  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: {
      tags,
      summary: 'Obtém campo personalizado',
      params: c.obter.params,
      response: { 200: c.obter.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: (req) => service.obterCampo(req.params.id),
  })

  app.route({
    method: c.criar.metodo,
    url: c.criar.caminho,
    schema: { tags, summary: 'Cria campo personalizado', body: c.criar.body, response: { 201: c.criar.resposta } },
    config: { acesso: 'cadastro.gerenciar' },
    handler: async (req, reply) => reply.code(201).send(await service.criarCampo(req.body, contextoDe(req))),
  })

  app.route({
    method: c.atualizar.metodo,
    url: c.atualizar.caminho,
    schema: {
      tags,
      summary: 'Atualiza campo personalizado',
      params: c.atualizar.params,
      body: c.atualizar.body,
      response: { 200: c.atualizar.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: (req) => service.atualizarCampo(req.params.id, req.body, contextoDe(req)),
  })

  app.route({
    method: c.excluir.metodo,
    url: c.excluir.caminho,
    schema: {
      tags,
      summary: 'Exclui campo personalizado',
      params: c.excluir.params,
      response: { 204: c.excluir.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: async (req, reply) => {
      await service.excluirCampo(req.params.id, contextoDe(req))
      return reply.code(204).send()
    },
  })
}
