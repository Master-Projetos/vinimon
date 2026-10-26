import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import * as acoes from './acoes'
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
    method: c.mesmoDepartamento.metodo,
    url: c.mesmoDepartamento.caminho,
    schema: {
      tags,
      summary: 'Busca pessoas do mesmo departamento (abrir chamado em nome de outro)',
      querystring: c.mesmoDepartamento.query,
      response: { 200: c.mesmoDepartamento.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => service.buscarMesmoDepartamento(req.query, contextoDe(req)),
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

  app.route({
    method: c.redefinirSenha.metodo,
    url: c.redefinirSenha.caminho,
    schema: {
      tags,
      summary: 'Redefine a senha (temporária, mostrada uma vez)',
      params: c.redefinirSenha.params,
      body: c.redefinirSenha.body,
      response: { 200: c.redefinirSenha.resposta },
    },
    config: { acesso: 'usuario.gerenciar' },
    handler: (req) => acoes.redefinirSenha(req.params.id, contextoDe(req)),
  })

  app.route({
    method: c.resetar2fa.metodo,
    url: c.resetar2fa.caminho,
    schema: {
      tags,
      summary: 'Reseta o 2FA do usuário',
      params: c.resetar2fa.params,
      body: c.resetar2fa.body,
      response: { 200: c.resetar2fa.resposta },
    },
    config: { acesso: 'usuario.gerenciar' },
    handler: async (req) => {
      await acoes.resetar2fa(req.params.id, req.body.senhaAdmin, contextoDe(req))
      return { ok: true as const }
    },
  })

  app.route({
    method: c.encerrarSessoes.metodo,
    url: c.encerrarSessoes.caminho,
    schema: {
      tags,
      summary: 'Encerra todas as sessões do usuário',
      params: c.encerrarSessoes.params,
      body: c.encerrarSessoes.body,
      response: { 200: c.encerrarSessoes.resposta },
    },
    config: { acesso: 'usuario.gerenciar' },
    handler: async (req) => {
      await acoes.encerrarSessoes(req.params.id, contextoDe(req))
      return { ok: true as const }
    },
  })

  app.route({
    method: c.desbloquearLogin.metodo,
    url: c.desbloquearLogin.caminho,
    schema: {
      tags,
      summary: 'Desbloqueia o login do usuário',
      params: c.desbloquearLogin.params,
      body: c.desbloquearLogin.body,
      response: { 200: c.desbloquearLogin.resposta },
    },
    config: { acesso: 'usuario.gerenciar' },
    handler: async (req) => {
      await acoes.desbloquearLogin(req.params.id, contextoDe(req))
      return { ok: true as const }
    },
  })

  app.route({
    method: c.anonimizar.metodo,
    url: c.anonimizar.caminho,
    schema: {
      tags,
      summary: 'Anonimiza o usuário',
      params: c.anonimizar.params,
      body: c.anonimizar.body,
      response: { 200: c.anonimizar.resposta },
    },
    config: { acesso: 'usuario.gerenciar' },
    handler: async (req) => {
      await acoes.anonimizarUsuario(req.params.id, contextoDe(req))
      return { ok: true as const }
    },
  })
}
