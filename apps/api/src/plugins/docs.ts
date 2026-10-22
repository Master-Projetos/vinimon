import swagger from '@fastify/swagger'
import scalar from '@scalar/fastify-api-reference'
import fp from 'fastify-plugin'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'
import { NOME_COOKIE } from '../lib/sessao'

export const docsPlugin = fp(
  async (app) => {
    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: { title: 'Vinimon API', version: '1.0.0' },
        components: { securitySchemes: { sessao: { type: 'apiKey', in: 'cookie', name: NOME_COOKIE } } },
        security: [{ sessao: [] }],
      },
      transform: jsonSchemaTransform,
    })
    await app.register(scalar, { routePrefix: '/api/docs' })
  },
  { name: 'docs' },
)
