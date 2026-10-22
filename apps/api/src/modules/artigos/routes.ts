import { artigosApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import { naoAutenticado } from '../../lib/erros'
import * as service from './service'

const tags = ['Artigos']

export const rotasArtigos: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Lista artigos visíveis ao usuário',
      querystring: c.listar.query,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.listarArtigos(req.query, req.usuario)
    },
  })

  app.route({
    method: c.sugestoes.metodo,
    url: c.sugestoes.caminho,
    schema: {
      tags,
      summary: 'Sugere até 5 artigos para um texto',
      querystring: c.sugestoes.query,
      response: { 200: c.sugestoes.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.sugerirArtigos(req.query, req.usuario)
    },
  })

  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: {
      tags,
      summary: 'Obtém um artigo e conta a visualização',
      params: c.obter.params,
      response: { 200: c.obter.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.obterArtigo(req.params.id, req.usuario)
    },
  })

  app.route({
    method: c.criar.metodo,
    url: c.criar.caminho,
    schema: { tags, summary: 'Cria artigo', body: c.criar.body, response: { 201: c.criar.resposta } },
    config: { acesso: 'conhecimento.gerenciar' },
    handler: async (req, reply) => reply.code(201).send(await service.criarArtigo(req.body, contextoDe(req))),
  })

  app.route({
    method: c.atualizar.metodo,
    url: c.atualizar.caminho,
    schema: {
      tags,
      summary: 'Atualiza artigo',
      params: c.atualizar.params,
      body: c.atualizar.body,
      response: { 200: c.atualizar.resposta },
    },
    config: { acesso: 'conhecimento.gerenciar' },
    handler: (req) => service.atualizarArtigo(req.params.id, req.body, contextoDe(req)),
  })

  app.route({
    method: c.excluir.metodo,
    url: c.excluir.caminho,
    schema: { tags, summary: 'Exclui artigo', params: c.excluir.params, response: { 204: c.excluir.resposta } },
    config: { acesso: 'conhecimento.gerenciar' },
    handler: async (req, reply) => {
      await service.excluirArtigo(req.params.id, contextoDe(req))
      return reply.code(204).send()
    },
  })

  app.route({
    method: c.votar.metodo,
    url: c.votar.caminho,
    schema: {
      tags,
      summary: 'Vota se o artigo foi útil',
      params: c.votar.params,
      body: c.votar.body,
      response: { 204: c.votar.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: async (req, reply) => {
      if (!req.usuario) throw naoAutenticado()
      await service.votarArtigo(req.params.id, req.body.util, req.usuario)
      return reply.code(204).send()
    },
  })
}
