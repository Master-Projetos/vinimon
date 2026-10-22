import { relatoriosApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { naoAutenticado } from '../../lib/erros'
import * as service from './service'

export const rotasRelatorios: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: {
      tags: ['Relatórios'],
      summary: 'Relatório agregado dentro do escopo do usuário',
      params: c.obter.params,
      querystring: c.obter.query,
      response: { 200: c.obter.resposta },
    },
    config: { acesso: 'relatorio.ver' },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.gerarRelatorio(req.usuario, req.params.tipo, req.query)
    },
  })
}
