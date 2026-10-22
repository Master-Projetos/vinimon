import { resolve, sep } from 'node:path'
import fastifyStatic from '@fastify/static'
import fp from 'fastify-plugin'
import { responderRotaInexistente } from '../lib/erros'

export const spaPlugin = fp<{ raiz: string }>(
  async (app, { raiz }) => {
    await app.register(fastifyStatic, {
      root: resolve(raiz),
      setHeaders: (res, caminho) => {
        const imutavel = caminho.includes(`${sep}assets${sep}`)
        res.header('Cache-Control', imutavel ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    })
    app.setNotFoundHandler((req, reply) => {
      const ehApi = req.url.startsWith('/api/') || req.url.startsWith('/socket.io/')
      if (req.method !== 'GET' || ehApi) return responderRotaInexistente(req, reply)
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html')
    })
  },
  { name: 'spa' },
)
