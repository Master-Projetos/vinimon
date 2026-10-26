import { ativosApi as c } from '@vinimon/shared'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import { naoAutenticado, semPermissao } from '../../lib/erros'
import * as service from './service'

const tags = ['Ativos']

/** A17: OPERADOR sem nenhuma área com o módulo de inventário recebe 403; ADMIN e demais perfis não são afetados. */
async function exigirInventario(req: FastifyRequest): Promise<void> {
  if (req.usuario?.perfil === 'OPERADOR' && req.usuario.inventarioHabilitado === false) {
    throw semPermissao('O módulo de inventário não está habilitado para as suas áreas.')
  }
}

export const rotasAtivos: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.buscar.metodo,
    url: c.buscar.caminho,
    schema: {
      tags,
      summary: 'Busca ativos por texto',
      querystring: c.buscar.query,
      response: { 200: c.buscar.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => service.buscarAtivos(req.query),
  })

  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: { tags, summary: 'Lista ativos', querystring: c.listar.query, response: { 200: c.listar.resposta } },
    config: { acesso: 'inventario.ver' },
    preValidation: exigirInventario,
    handler: (req) => service.listarAtivos(req.query),
  })

  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: { tags, summary: 'Obtém ativo', params: c.obter.params, response: { 200: c.obter.resposta } },
    config: { acesso: 'inventario.ver' },
    preValidation: exigirInventario,
    handler: (req) => service.obterAtivo(req.params.id),
  })

  app.route({
    method: c.chamados.metodo,
    url: c.chamados.caminho,
    schema: {
      tags,
      summary: 'Lista chamados do ativo dentro do escopo do usuário',
      params: c.chamados.params,
      querystring: c.chamados.query,
      response: { 200: c.chamados.resposta },
    },
    config: { acesso: 'inventario.ver' },
    preValidation: exigirInventario,
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.chamadosDoAtivo(req.params.id, req.query, req.usuario)
    },
  })

  app.route({
    method: c.criar.metodo,
    url: c.criar.caminho,
    schema: { tags, summary: 'Cria ativo', body: c.criar.body, response: { 201: c.criar.resposta } },
    config: { acesso: 'inventario.gerenciar' },
    preValidation: exigirInventario,
    handler: async (req, reply) => reply.code(201).send(await service.criarAtivo(req.body, contextoDe(req))),
  })

  app.route({
    method: c.atualizar.metodo,
    url: c.atualizar.caminho,
    schema: {
      tags,
      summary: 'Atualiza ativo',
      params: c.atualizar.params,
      body: c.atualizar.body,
      response: { 200: c.atualizar.resposta },
    },
    config: { acesso: 'inventario.gerenciar' },
    preValidation: exigirInventario,
    handler: (req) => service.atualizarAtivo(req.params.id, req.body, contextoDe(req)),
  })

  app.route({
    method: c.excluir.metodo,
    url: c.excluir.caminho,
    schema: { tags, summary: 'Exclui ativo', params: c.excluir.params, response: { 204: c.excluir.resposta } },
    config: { acesso: 'cadastro.gerenciar' },
    handler: async (req, reply) => {
      await service.excluirAtivo(req.params.id, contextoDe(req))
      return reply.code(204).send()
    },
  })
}
