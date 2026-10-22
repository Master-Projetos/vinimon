import { randomUUID } from 'node:crypto'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import underPressure from '@fastify/under-pressure'
import { configurarZod } from '@vinimon/shared'
import Fastify, { type FastifyServerOptions } from 'fastify'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { env } from './env'
import { responderRotaInexistente } from './lib/erros'
import { rotasSaude } from './modules/saude/routes'
import { autenticacaoPlugin } from './plugins/autenticacao'
import { docsPlugin } from './plugins/docs'
import { errosPlugin } from './plugins/erros'
import { segurancaPlugin } from './plugins/seguranca'
import { spaPlugin } from './plugins/spa'

configurarZod()

const REDACT = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.senha',
  '*.senhaAtual',
  '*.novaSenha',
  '*.token',
  '*.codigo',
  '*.segredo',
  '*.password',
]
const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'

export interface OpcoesApp {
  logger?: FastifyServerOptions['logger']
}

export async function buildApp(opcoes: OpcoesApp = {}) {
  const host = new URL(env.APP_ORIGIN).host
  const app = Fastify({
    logger: opcoes.logger ?? {
      level: env.LOG_LEVEL,
      redact: { paths: REDACT, censor: '[REDACTED]' },
      ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1_048_576,
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    requestTimeout: 120_000,
    connectionTimeout: 60_000,
    onProtoPoisoning: 'error',
    onConstructorPoisoning: 'error',
  }).withTypeProvider<ZodTypeProvider>()
  app.server.headersTimeout = 30_000

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.removeContentTypeParser('text/plain')

  await app.register(errosPlugin)
  await app.register(helmet, {
    contentSecurityPolicy:
      env.NODE_ENV === 'development'
        ? false
        : {
            useDefaults: false,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              scriptSrcAttr: ["'none'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              fontSrc: ["'self'"],
              connectSrc: ["'self'", `${env.HTTPS ? 'wss' : 'ws'}://${host}`],
              mediaSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'none'"],
              formAction: ["'self'"],
              workerSrc: ["'self'"],
              manifestSrc: ["'self'"],
              reportUri: ['/api/v1/seguranca/csp'],
              ...(env.HTTPS ? { upgradeInsecureRequests: [] } : {}),
            },
          },
    strictTransportSecurity: env.HTTPS ? { maxAge: 31_536_000 } : false,
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'same-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  })
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Permissions-Policy', PERMISSIONS_POLICY)
  })
  await app.register(cookie)
  await app.register(underPressure, { maxEventLoopDelay: 1000, retryAfter: 10 })
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    hook: 'preHandler',
    keyGenerator: (req) => (req.usuario ? `u:${req.usuario.id}` : `ip:${req.ip}`),
  })
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_ANEXO_MB * 1024 * 1024,
      files: 5,
      fields: 5,
      fieldSize: 1024,
      parts: 10,
      headerPairs: 200,
    },
  })
  if (env.API_DOCS) await app.register(docsPlugin)

  await app.register(
    async (api) => {
      await api.register(autenticacaoPlugin)
      await api.register(segurancaPlugin)
      await api.register(rotasSaude)
      // cada módulo novo: 1 import + 1 linha aqui (ordem alfabética)
    },
    { prefix: '/api/v1' },
  )

  if (env.WEB_DIST_DIR) await app.register(spaPlugin, { raiz: env.WEB_DIST_DIR })
  else app.setNotFoundHandler(responderRotaInexistente)

  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>
