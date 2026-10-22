import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import { chamadosApi as c } from './schemas'
import * as service from './service'

const tags = ['Chamados']

export const rotasChamados: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.criar.metodo,
    url: c.criar.caminho,
    schema: { tags, summary: 'Abre um chamado', body: c.criar.body, response: { 201: c.criar.resposta } },
    config: { acesso: 'chamado.abrir' },
    handler: async (req, reply) => reply.code(201).send(await service.abrirChamado(req.body, contextoDe(req), req.log)),
  })
}
