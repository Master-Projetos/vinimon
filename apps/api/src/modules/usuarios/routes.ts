import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import { usuariosApi as c } from './schemas'
import * as service from './service'

const tags = ['Usuários']

export const rotasUsuarios: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: { tags, summary: 'Lista usuários', querystring: c.listar.query, response: { 200: c.listar.resposta } },
    config: { acesso: 'usuario.gerenciar' },
    handler: (req) => service.listarUsuarios(req.query),
  })

  app.route({
    method: c.buscar.metodo,
    url: c.buscar.caminho,
    schema: {
      tags,
      summary: 'Busca usuários ativos (diretório)',
      querystring: c.buscar.query,
      response: { 200: c.buscar.resposta },
    },
    config: { acesso: 'usuario.buscar' },
    handler: (req) => service.buscarUsuarios(req.query, contextoDe(req)),
  })

  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: { tags, summary: 'Obtém usuário', params: c.obter.params, response: { 200: c.obter.resposta } },
    config: { acesso: 'usuario.gerenciar' },
    handler: (req) => service.obterUsuario(req.params.id),
  })

  app.route({
    method: c.criar.metodo,
    url: c.criar.caminho,
    schema: { tags, summary: 'Cria usuário', body: c.criar.body, response: { 201: c.criar.resposta } },
    config: { acesso: 'usuario.gerenciar' },
    handler: async (req, reply) => reply.code(201).send(await service.criarUsuario(req.body, contextoDe(req))),
  })

  app.route({
    method: c.atualizar.metodo,
    url: c.atualizar.caminho,
    schema: {
      tags,
      summary: 'Atualiza usuário',
      params: c.atualizar.params,
      body: c.atualizar.body,
      response: { 200: c.atualizar.resposta },
    },
    config: { acesso: 'usuario.gerenciar' },
    handler: (req) => service.atualizarUsuario(req.params.id, req.body, contextoDe(req)),
  })
}
