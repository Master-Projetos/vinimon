import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { naoAutenticado } from '../../lib/erros'
import { projetosApi as c } from './schemas'
import * as service from './service'

const tags = ['Projetos']

export const rotasProjetos: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: {
      tags,
      summary: 'Obtém projeto com a árvore de subchamados visíveis',
      params: c.obter.params,
      response: { 200: c.obter.resposta },
    },
    config: { acesso: 'chamado.abrir' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.obterProjeto(req.usuario, req.params.id)
    },
  })
}
