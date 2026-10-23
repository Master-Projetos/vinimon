import { notificacoesApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { naoAutenticado } from '../../lib/erros'
import * as service from './service'

const tags = ['Notificações']

export const rotasNotificacoes: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Feed de atividade do usuário',
      querystring: c.listar.query,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.listarNotificacoes(req.usuario, req.query)
    },
  })

  app.route({
    method: c.contagem.metodo,
    url: c.contagem.caminho,
    schema: { tags, summary: 'Contagem de não lidas', response: { 200: c.contagem.resposta } },
    config: { acesso: 'autenticado' },
    handler: async (req) => {
      if (!req.usuario) throw naoAutenticado()
      return { naoLidas: await service.contarNaoLidas(req.usuario) }
    },
  })

  app.route({
    method: c.marcarLida.metodo,
    url: c.marcarLida.caminho,
    schema: {
      tags,
      summary: 'Marca a notificação como lida',
      params: c.marcarLida.params,
      response: { 200: c.marcarLida.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.marcarLida(req.usuario, req.params.id)
    },
  })

  app.route({
    method: c.marcarNaoLida.metodo,
    url: c.marcarNaoLida.caminho,
    schema: {
      tags,
      summary: 'Marca a notificação como não lida',
      params: c.marcarNaoLida.params,
      response: { 200: c.marcarNaoLida.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.marcarNaoLida(req.usuario, req.params.id)
    },
  })

  app.route({
    method: c.marcarTodasLidas.metodo,
    url: c.marcarTodasLidas.caminho,
    schema: {
      tags,
      summary: 'Marca como lidas todas as notificações (ou as de um chamado)',
      body: c.marcarTodasLidas.body,
      response: { 200: c.marcarTodasLidas.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.marcarTodasLidas(req.usuario, req.body.chamadoId)
    },
  })

  app.route({
    method: c.preferencias.metodo,
    url: c.preferencias.caminho,
    schema: { tags, summary: 'Preferências de notificação', response: { 200: c.preferencias.resposta } },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.obterPreferencias(req.usuario)
    },
  })

  app.route({
    method: c.atualizarPreferencias.metodo,
    url: c.atualizarPreferencias.caminho,
    schema: {
      tags,
      summary: 'Atualiza as preferências de notificação',
      body: c.atualizarPreferencias.body,
      response: { 200: c.atualizarPreferencias.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.atualizarPreferencias(req.usuario, req.body)
    },
  })
}
