import { Writable } from 'node:stream'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { afterEach, describe, expect, it } from 'vitest'
import { type App, buildApp } from '../src/app'

const SEGREDOS = [
  'S3nh4-Super-Secreta',
  'vinimon_sid=abc123cookie',
  'Bearer tok-segredo-999',
  'csrf-token-secreto',
  '654321',
  'JBSWY3DPEHPK3PXP',
]

const rotasDeTeste: FastifyPluginAsyncZod = async (app) => {
  app.get('/teste/log', { config: { acesso: 'publico' } }, async (req) => {
    req.log.info(
      {
        dados: {
          senha: SEGREDOS[0],
          senhaAtual: SEGREDOS[0],
          novaSenha: SEGREDOS[0],
          password: SEGREDOS[0],
          token: SEGREDOS[2],
          codigo: SEGREDOS[4],
          segredo: SEGREDOS[5],
        },
        req: { headers: { cookie: SEGREDOS[1], authorization: SEGREDOS[2], 'x-csrf-token': SEGREDOS[3] } },
        res: { headers: { 'set-cookie': SEGREDOS[1] } },
      },
      'evento de teste',
    )
    return { ok: true }
  })
}

describe('T49: redação de logs', () => {
  let app: App
  afterEach(async () => {
    await app.close()
  })

  it('T49: segredos não aparecem nas linhas de log e [REDACTED] aparece', async () => {
    const linhas: string[] = []
    const stream = new Writable({
      write(chunk, _enc, cb) {
        linhas.push(String(chunk))
        cb()
      },
    })
    app = await buildApp({ logger: { level: 'info', stream }, rotasDeTeste })
    await app.ready()
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/teste/log',
      headers: { cookie: 'vinimon_sid=abc123cookie' },
    })
    expect(r.statusCode).toBe(200)
    const saida = linhas.join('')
    expect(saida).toContain('evento de teste')
    expect(saida).toContain('[REDACTED]')
    for (const s of SEGREDOS) expect(saida, s).not.toContain(s)
    expect(saida).toMatch(/"reqId"|"req":\{"id"|requestId|"id":"/)
  })
})
