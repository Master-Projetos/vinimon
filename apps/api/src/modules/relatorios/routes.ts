import { relatoriosApi as c } from '@vinimon/shared'
import { create as contentDisposition } from 'content-disposition'
import type { FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
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

  app.route({
    method: c.csv.metodo,
    url: c.csv.caminho,
    schema: {
      tags: ['Relatórios'],
      summary: 'Exporta o relatório em CSV (mesmo escopo e filtros do relatório)',
      params: c.csv.params,
      querystring: c.csv.query,
      response: { 200: c.csv.resposta }, // só documentação: a resposta é um stream de CSV
    },
    config: { acesso: 'relatorio.ver' },
    handler: async (req, reply) => {
      const { nomeArquivo, fluxo } = await service.exportarRelatorio(contextoDe(req), req.params.tipo, req.query)
      const envio: FastifyReply = reply
      return envio
        .type('text/csv; charset=utf-8')
        .header('content-disposition', contentDisposition(nomeArquivo))
        .send(fluxo)
    },
  })
}
