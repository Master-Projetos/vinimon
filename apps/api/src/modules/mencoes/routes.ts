import { PERFIS } from '@vinimon/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { naoAutenticado } from '../../lib/erros'
import * as service from './service'

const tags = ['Menções']

const params = z.strictObject({ id: z.coerce.number().int().positive() })
const query = z.strictObject({
  q: z.string().trim().max(80).default(''),
  interno: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})
const resposta = z.array(z.strictObject({ id: z.int(), nome: z.string(), perfil: z.enum(PERFIS) }))

export const rotasMencoes: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: 'GET',
    url: '/chamados/:id/mencionaveis',
    schema: {
      tags,
      summary: 'Lista quem pode ser mencionado no chamado',
      params,
      querystring: query,
      response: { 200: resposta },
    },
    config: { acesso: 'chamado.abrir', rateLimit: { max: 120, timeWindow: '1 minute' } },
    handler: (req) => {
      if (!req.usuario) throw naoAutenticado()
      return service.listarMencionaveis(req.usuario, req.params.id, req.query.q, req.query.interno)
    },
  })
}
