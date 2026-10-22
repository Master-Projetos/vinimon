import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { registrarViolacaoCsp } from './service'

const LIMITE = 8192

/** Recebe os relatórios de violação da CSP (report-uri). Sem sessão, sem CSRF e com limite de 8 KB (S75). */
export const rotasSeguranca: FastifyPluginAsyncZod = async (app) => {
  // Parser só deste plugin: os tipos dos relatórios não valem no resto da API (S34).
  app.addContentTypeParser(
    ['application/csp-report', 'application/reports+json'],
    { parseAs: 'string', bodyLimit: LIMITE },
    (_req, corpo, feito) => {
      try {
        feito(null, JSON.parse(String(corpo)))
      } catch {
        feito(null, null) // relatório malformado: ignorado, sem erro para o navegador
      }
    },
  )

  app.post(
    '/seguranca/csp',
    {
      schema: { tags: ['Segurança'], summary: 'Recebe violações da CSP', response: { 204: z.undefined() } },
      config: { acesso: 'publico', csrf: false, rateLimit: { max: 10, timeWindow: '1 minute' } },
      bodyLimit: LIMITE,
    },
    async (req, reply) => {
      registrarViolacaoCsp(req.log, req.body)
      return reply.code(204).send()
    },
  )
}
