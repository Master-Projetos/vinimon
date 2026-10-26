import { resolve, sep } from 'node:path'
import fastifyStatic from '@fastify/static'
import fp from 'fastify-plugin'
import { responderRotaInexistente } from '../lib/erros'

/**
 * Arquivos versionados do build (`/assets/<nome>-<hash>.js`): públicos, imutáveis e sem dados.
 * Ficam fora do rate limit por IP, porque uma única carga fria da tela já pede dezenas deles
 * e consumiria o limite das chamadas à API (300 por minuto).
 */
export function ehAssetEstatico(metodo: string, url: string): boolean {
  return (metodo === 'GET' || metodo === 'HEAD') && url.startsWith('/assets/')
}

/**
 * Mapas de código (`*.map`) são gerados com `sourcemap: 'hidden'` (S81), mas nunca podem ser servidos:
 * entregariam o código-fonte original a quem pedir o arquivo.
 */
export function ehSourceMap(url: string): boolean {
  return (url.split('?')[0] ?? '').endsWith('.map')
}

export const spaPlugin = fp<{ raiz: string }>(
  async (app, { raiz }) => {
    await app.register(fastifyStatic, {
      root: resolve(raiz),
      allowedPath: (caminho) => !ehSourceMap(caminho),
      setHeaders: (res, caminho) => {
        const imutavel = caminho.includes(`${sep}assets${sep}`)
        res.header('Cache-Control', imutavel ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    })
    app.setNotFoundHandler((req, reply) => {
      const ehApi = req.url.startsWith('/api/') || req.url.startsWith('/socket.io/')
      if (req.method !== 'GET' || ehApi || ehSourceMap(req.url)) return responderRotaInexistente(req, reply)
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html')
    })
  },
  { name: 'spa' },
)
