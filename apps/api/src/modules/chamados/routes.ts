import { create as contentDisposition } from 'content-disposition'
import type { FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { contextoDe } from '../../lib/contexto'
import { naoAutenticado } from '../../lib/erros'
import * as acoes from './acoes'
import * as consultas from './consultas'
import * as exportacao from './exportar'
import { chamadosApi as c } from './schemas'
import * as service from './service'

const tags = ['Chamados']

export const rotasChamados: FastifyPluginAsyncZod = async (app) => {
  // `/chamados/exportar` é rota estática: ganha de `/chamados/:id` no roteador, sem colisão.
  app.route({
    method: 'GET',
    url: '/chamados/exportar',
    schema: {
      tags,
      summary: 'Exporta a lista de chamados em CSV (mesmos filtros e escopo da lista, até 5.000 linhas)',
      querystring: c.listar.query,
      response: { 200: z.string() }, // só documentação: a resposta é um stream de CSV
    },
    config: { acesso: 'relatorio.ver' },
    handler: async (req, reply) => {
      const { nomeArquivo, fluxo } = await exportacao.exportarChamados(contextoDe(req), req.query)
      // O corpo é um stream: `response` acima é só documentação, então o `send` usa o tipo genérico do reply.
      const envio: FastifyReply = reply
      return envio
        .type('text/csv; charset=utf-8')
        .header('content-disposition', contentDisposition(nomeArquivo))
        .send(fluxo)
    },
  })

  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: {
      tags,
      summary: 'Lista chamados dentro do escopo do usuário',
      querystring: c.listar.query,
      response: { 200: c.listar.resposta },
    },
    config: { acesso: 'chamado.abrir' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return consultas.listar(req.usuario, req.query)
    },
  })

  app.route({
    method: c.contagens.metodo,
    url: c.contagens.caminho,
    schema: { tags, summary: 'Conta chamados por visão', response: { 200: c.contagens.resposta } },
    config: { acesso: 'chamado.abrir', rateLimit: { max: 30, timeWindow: '1 minute' } },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return consultas.contagens(req.usuario)
    },
  })

  app.route({
    method: c.reincidencia.metodo,
    url: c.reincidencia.caminho,
    schema: {
      tags,
      summary: 'Chamados recorrentes do ativo e do solicitante (dentro do escopo)',
      querystring: c.reincidencia.query,
      response: { 200: c.reincidencia.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return consultas.reincidencia(req.usuario, req.query)
    },
  })

  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: { tags, summary: 'Obtém um chamado', params: c.obter.params, response: { 200: c.obter.resposta } },
    config: { acesso: 'chamado.abrir' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return consultas.obterDetalhe(req.usuario, req.params.id)
    },
  })

  app.route({
    method: c.historico.metodo,
    url: c.historico.caminho,
    schema: {
      tags,
      summary: 'Histórico de eventos do chamado',
      params: c.historico.params,
      response: { 200: c.historico.resposta },
    },
    config: { acesso: 'chamado.abrir' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return consultas.historico(req.usuario, req.params.id)
    },
  })

  app.route({
    method: c.criar.metodo,
    url: c.criar.caminho,
    schema: { tags, summary: 'Abre um chamado', body: c.criar.body, response: { 201: c.criar.resposta } },
    config: { acesso: 'chamado.abrir' },
    handler: async (req, reply) => reply.code(201).send(await service.abrirChamado(req.body, contextoDe(req), req.log)),
  })

  app.route({
    method: c.assumir.metodo,
    url: c.assumir.caminho,
    schema: {
      tags,
      summary: 'Assume o chamado',
      params: c.assumir.params,
      body: c.assumir.body,
      response: { 200: c.assumir.resposta },
    },
    config: { acesso: 'chamado.atender' },
    handler: (req) => acoes.assumir(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.encaminhar.metodo,
    url: c.encaminhar.caminho,
    schema: {
      tags,
      summary: 'Encaminha o chamado para outra área ou operador',
      params: c.encaminhar.params,
      body: c.encaminhar.body,
      response: { 200: c.encaminhar.resposta },
    },
    config: { acesso: 'chamado.atender' },
    handler: (req) => acoes.encaminhar(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.status.metodo,
    url: c.status.caminho,
    schema: {
      tags,
      summary: 'Troca o status do chamado',
      params: c.status.params,
      body: c.status.body,
      response: { 200: c.status.resposta },
    },
    config: { acesso: 'chamado.atender' },
    handler: (req) => acoes.trocarStatus(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.prioridade.metodo,
    url: c.prioridade.caminho,
    schema: {
      tags,
      summary: 'Troca a prioridade do chamado',
      params: c.prioridade.params,
      body: c.prioridade.body,
      response: { 200: c.prioridade.resposta },
    },
    config: { acesso: 'chamado.atender' },
    handler: (req) => acoes.trocarPrioridade(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.classificacao.metodo,
    url: c.classificacao.caminho,
    schema: {
      tags,
      summary: 'Altera problema, departamento, ativo ou canal',
      params: c.classificacao.params,
      body: c.classificacao.body,
      response: { 200: c.classificacao.resposta },
    },
    config: { acesso: 'chamado.atender' },
    handler: (req) => acoes.classificar(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.tags.metodo,
    url: c.tags.caminho,
    schema: {
      tags,
      summary: 'Substitui as tags do chamado',
      params: c.tags.params,
      body: c.tags.body,
      response: { 200: c.tags.resposta },
    },
    config: { acesso: 'chamado.atender' },
    handler: (req) => acoes.atualizarTags(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.agendar.metodo,
    url: c.agendar.caminho,
    schema: {
      tags,
      summary: 'Agenda o chamado',
      params: c.agendar.params,
      body: c.agendar.body,
      response: { 200: c.agendar.resposta },
    },
    config: { acesso: 'chamado.atender' },
    handler: (req) => acoes.agendar(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.concluir.metodo,
    url: c.concluir.caminho,
    schema: {
      tags,
      summary: 'Conclui o chamado',
      params: c.concluir.params,
      body: c.concluir.body,
      response: { 200: c.concluir.resposta },
    },
    config: { acesso: 'chamado.atender' },
    handler: (req) => acoes.concluir(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.aprovar.metodo,
    url: c.aprovar.caminho,
    schema: {
      tags,
      summary: 'Aprova a conclusão (solicitante)',
      params: c.aprovar.params,
      body: c.aprovar.body,
      response: { 200: c.aprovar.resposta },
    },
    config: { acesso: 'chamado.comentar' },
    handler: (req) => acoes.aprovar(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.rejeitar.metodo,
    url: c.rejeitar.caminho,
    schema: {
      tags,
      summary: 'Rejeita a conclusão (solicitante)',
      params: c.rejeitar.params,
      body: c.rejeitar.body,
      response: { 200: c.rejeitar.resposta },
    },
    config: { acesso: 'chamado.comentar' },
    handler: (req) => acoes.rejeitar(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.solicitarRetorno.metodo,
    url: c.solicitarRetorno.caminho,
    schema: {
      tags,
      summary: 'Solicita o retorno do solicitante (comentário público, status aguardando e e-mail)',
      params: c.solicitarRetorno.params,
      body: c.solicitarRetorno.body,
      response: { 200: c.solicitarRetorno.resposta },
    },
    config: { acesso: 'chamado.atender' },
    handler: (req) => acoes.solicitarRetorno(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.reabrir.metodo,
    url: c.reabrir.caminho,
    schema: {
      tags,
      summary: 'Reabre o chamado',
      params: c.reabrir.params,
      body: c.reabrir.body,
      response: { 200: c.reabrir.resposta },
    },
    config: { acesso: 'chamado.comentar' },
    handler: (req) => acoes.reabrir(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.cancelar.metodo,
    url: c.cancelar.caminho,
    schema: {
      tags,
      summary: 'Cancela o chamado',
      params: c.cancelar.params,
      body: c.cancelar.body,
      response: { 200: c.cancelar.resposta },
    },
    config: { acesso: 'chamado.comentar' },
    handler: (req) => acoes.cancelar(req.params.id, req.body, contextoDe(req), req.log),
  })

  app.route({
    method: c.seguir.metodo,
    url: c.seguir.caminho,
    schema: {
      tags,
      summary: 'Passa a seguir o chamado',
      params: c.seguir.params,
      response: { 204: c.seguir.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: async (req, reply) => {
      if (!req.usuario) throw naoAutenticado()
      await acoes.seguir(req.params.id, req.usuario)
      return reply.code(204).send()
    },
  })

  app.route({
    method: c.deixarDeSeguir.metodo,
    url: c.deixarDeSeguir.caminho,
    schema: {
      tags,
      summary: 'Deixa de seguir o chamado',
      params: c.deixarDeSeguir.params,
      response: { 204: c.deixarDeSeguir.resposta },
    },
    config: { acesso: 'autenticado' },
    handler: async (req, reply) => {
      if (!req.usuario) throw naoAutenticado()
      await acoes.deixarDeSeguir(req.params.id, req.usuario)
      return reply.code(204).send()
    },
  })
}
