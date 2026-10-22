import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { verificarBanco } from './service'

const OkSchema = z.object({ ok: z.literal(true) })

export const rotasSaude: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/saude',
    { schema: { tags: ['Saúde'], response: { 200: OkSchema } }, config: { acesso: 'publico' } },
    async () => ({
      ok: true as const,
    }),
  )
  app.get(
    '/saude/pronto',
    { schema: { tags: ['Saúde'], response: { 200: OkSchema } }, config: { acesso: 'publico' } },
    async () => {
      await verificarBanco()
      return { ok: true as const }
    },
  )
}
