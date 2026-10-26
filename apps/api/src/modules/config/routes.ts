import { configApi as c } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { contextoDe } from '../../lib/contexto'
import { testarConexaoLdap } from '../auth/service'
import * as service from './service'

const tags = ['Configuração']

export const rotasConfig: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: { tags, summary: 'Obtém a configuração do sistema', response: { 200: c.obter.resposta } },
    config: { acesso: 'config.gerenciar' },
    handler: () => service.obterConfigApi(),
  })

  app.route({
    method: c.atualizar.metodo,
    url: c.atualizar.caminho,
    schema: {
      tags,
      summary: 'Altera a configuração do sistema',
      body: c.atualizar.body,
      response: { 200: c.atualizar.resposta },
    },
    config: { acesso: 'config.gerenciar' },
    handler: (req) => service.atualizarConfig(req.body, contextoDe(req)),
  })

  app.route({
    method: 'POST',
    url: '/config/ldap/testar',
    schema: {
      tags,
      summary: 'Testa a conexão e o bind de serviço do LDAP',
      body: z.strictObject({}),
      response: { 200: z.strictObject({ ok: z.boolean(), mensagem: z.string() }) },
    },
    config: { acesso: 'config.gerenciar' },
    handler: (req) => testarConexaoLdap(contextoDe(req)),
  })
}
