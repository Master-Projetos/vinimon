import type { IncomingHttpHeaders } from 'node:http'
import { CSRF_HEADER } from '@vinimon/shared'
import fp from 'fastify-plugin'
import { env } from '../env'
import { csrfInvalido, origemInvalida } from '../lib/erros'
import { csrfValido } from '../lib/sessao'

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function origemValida(h: IncomingHttpHeaders): boolean {
  if (h.origin !== undefined) return h.origin === env.APP_ORIGIN // "null" e origens externas falham
  return h['sec-fetch-site'] === 'same-origin'
}

/** CSRF em duas camadas (S32, S33). Registrar DEPOIS do autenticacaoPlugin. */
export const segurancaPlugin = fp(
  async (app) => {
    app.addHook('onRequest', async (req) => {
      if (METODOS_SEGUROS.has(req.method)) return
      const { acesso, csrf } = req.routeOptions.config
      if (csrf === false) return
      if (!origemValida(req.headers)) throw origemInvalida()
      if (acesso === 'publico' || req.usuario === null) return // sem sessão: o preValidation devolve 401
      const token = req.headers[CSRF_HEADER]
      if (typeof token !== 'string' || !csrfValido(token, req.usuario.sessaoId)) throw csrfInvalido()
    })
  },
  { name: 'seguranca', dependencies: ['autenticacao'] },
)
