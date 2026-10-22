import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import { naoAutenticado } from '../../lib/erros'
import * as consultas from './consultas'
import { chamadosApi as c } from './schemas'
import * as service from './service'

const tags = ['Chamados']

export const rotasChamados: FastifyPluginAsyncZod = async (app) => {
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
    method: c.criar.metodo,
    url: c.criar.caminho,
    schema: { tags, summary: 'Abre um chamado', body: c.criar.body, response: { 201: c.criar.resposta } },
    config: { acesso: 'chamado.abrir' },
    handler: async (req, reply) => reply.code(201).send(await service.abrirChamado(req.body, contextoDe(req), req.log)),
  })
}
