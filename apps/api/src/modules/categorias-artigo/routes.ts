import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import { categoriasArtigoApi as c } from './schemas'
import * as service from './service'

const tags = ['Categorias de artigo']

export const rotasCategoriasArtigo: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Lista categorias de artigo',
      querystring: c.listar.query,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: (req) => service.listarCategoriasArtigo(req.query),
  })

  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: { tags, summary: 'Obtém categoria de artigo', params: c.obter.params, response: { 200: c.obter.resposta } },
    config: { acesso: 'cadastro.gerenciar' },
    handler: (req) => service.obterCategoriaArtigo(req.params.id),
  })

  app.route({
    method: c.criar.metodo,
    url: c.criar.caminho,
    schema: { tags, summary: 'Cria categoria de artigo', body: c.criar.body, response: { 201: c.criar.resposta } },
    config: { acesso: 'cadastro.gerenciar' },
    handler: async (req, reply) => reply.code(201).send(await service.criarCategoriaArtigo(req.body, contextoDe(req))),
  })

  app.route({
    method: c.atualizar.metodo,
    url: c.atualizar.caminho,
    schema: {
      tags,
      summary: 'Atualiza categoria de artigo',
      params: c.atualizar.params,
      body: c.atualizar.body,
      response: { 200: c.atualizar.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: (req) => service.atualizarCategoriaArtigo(req.params.id, req.body, contextoDe(req)),
  })

  app.route({
    method: c.excluir.metodo,
    url: c.excluir.caminho,
    schema: {
      tags,
      summary: 'Exclui categoria de artigo',
      params: c.excluir.params,
      response: { 204: c.excluir.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: async (req, reply) => {
      await service.excluirCategoriaArtigo(req.params.id, contextoDe(req))
      return reply.code(204).send()
    },
  })
}
