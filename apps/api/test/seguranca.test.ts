import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type App, buildApp } from '../src/app'
import { criarUsuario, headersDe, limparBanco, ORIGEM, SENHA_TESTE } from './ajudantes'

const JSON_HDR = { 'content-type': 'application/json' }

const rotasDeTeste: FastifyPluginAsyncZod = async (app) => {
  app.get('/teste/sem-acesso', {}, async () => ({ ok: true })) // sem config.acesso: precisa dar 403 (T41)
  app.get('/teste/explode', { config: { acesso: 'publico' } }, async () => {
    throw new Error('segredo-interno: select * from usuarios')
  })
}

/** Conjunto de diretivas da CSP (S73), para comparar sem depender da ordem. */
const diretivas = (csp: string): Set<string> =>
  new Set(
    csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean),
  )

function cspEsperada(host: string, https: boolean): Set<string> {
  return new Set([
    "default-src 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${https ? 'wss' : 'ws'}://${host}`,
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    'report-uri /api/v1/seguranca/csp',
    ...(https ? ['upgrade-insecure-requests'] : []),
  ])
}

describe('endurecimento da API', () => {
  let app: App
  beforeEach(async () => {
    await limparBanco()
    app = await buildApp({ logger: false, rotasDeTeste })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  it('T28: mutação sem Origin/Sec-Fetch-Site, de outra origem, com Origin null, sem token ou com token alheio dá 403; completa passa', async () => {
    const a = await criarUsuario({ perfil: 'USUARIO' })
    const b = await criarUsuario({ perfil: 'USUARIO' })
    const ha = await headersDe(a.id)
    const hb = await headersDe(b.id)
    const sair = (headers: Record<string, string>) =>
      app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers })
    const sem = { cookie: ha.cookie, 'x-csrf-token': ha['x-csrf-token'] }
    expect((await sair(sem)).statusCode).toBe(403)
    expect((await sair({ ...ha, origin: 'https://evil.test' })).statusCode).toBe(403)
    expect((await sair({ ...ha, origin: 'null' })).statusCode).toBe(403)
    expect((await sair({ cookie: ha.cookie, origin: ORIGEM })).statusCode).toBe(403)
    expect((await sair({ ...ha, 'x-csrf-token': hb['x-csrf-token'] })).statusCode).toBe(403)
    expect((await sair(ha)).statusCode).toBe(204)
  })

  it('T29: text/plain com JSON válido dá 415', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'text/plain', origin: ORIGEM },
      payload: JSON.stringify({ login: u.login, senha: SENHA_TESTE }),
    })
    expect(r.statusCode).toBe(415)
    expect(r.json().erro.codigo).toBe('CONTEUDO_NAO_SUPORTADO')
  })

  it('T30: nenhuma resposta leva Access-Control-Allow-Origin, nem o OPTIONS com origem externa', async () => {
    for (const [method, url] of [
      ['GET', '/api/v1/saude'],
      ['OPTIONS', '/api/v1/saude'],
      ['OPTIONS', '/api/v1/auth/login'],
    ] as const) {
      const r = await app.inject({
        method,
        url,
        headers: { origin: 'https://evil.test', 'access-control-request-method': 'POST' },
      })
      expect(r.headers['access-control-allow-origin'], `${method} ${url}`).toBeUndefined()
    }
  })

  it('T31: CSP com o conjunto de diretivas da S73 e os demais cabeçalhos da S74 (http: sem HSTS)', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/saude' })
    const csp = String(r.headers['content-security-policy'])
    expect(diretivas(csp)).toEqual(cspEsperada(new URL(ORIGEM).host, false))
    expect(r.headers['x-frame-options']).toBe('DENY')
    expect(r.headers['referrer-policy']).toBe('same-origin')
    expect(r.headers['x-content-type-options']).toBe('nosniff')
    expect(r.headers['cross-origin-opener-policy']).toBe('same-origin')
    expect(r.headers['cross-origin-resource-policy']).toBe('same-origin')
    expect(r.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()')
    expect(r.headers['strict-transport-security']).toBeUndefined()
  })

  it('T32: __proto__, constructor.prototype e chave desconhecida dão 400', async () => {
    const enviar = (payload: string) =>
      app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { ...JSON_HDR, origin: ORIGEM }, payload })
    expect((await enviar('{"__proto__":{"x":1}}')).statusCode).toBe(400)
    expect((await enviar('{"constructor":{"prototype":{}}}')).statusCode).toBe(400)
    expect((await enviar('{"login":"abc","senha":"x","extra":1}')).statusCode).toBe(400)
    expect(Object.hasOwn(Object.prototype, 'x')).toBe(false)
  })

  it('T41: toda rota /api/v1 declara acesso; uma rota de teste sem acesso dá 403', async () => {
    const reais = app.rotasApi.filter((r) => !r.url.startsWith('/api/v1/teste/'))
    expect(reais.length).toBeGreaterThan(10)
    expect(reais.filter((r) => r.acesso === undefined)).toEqual([])
    const r = await app.inject({ method: 'GET', url: '/api/v1/teste/sem-acesso' })
    expect(r.statusCode).toBe(403)
    expect(r.json().erro.codigo).toBe('SEM_PERMISSAO')
  })

  it('T51: erro 500 devolve INTERNO com requestId, sem stack nem detalhes', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/teste/explode' })
    expect(r.statusCode).toBe(500)
    const corpo = r.json()
    expect(corpo.erro.codigo).toBe('INTERNO')
    expect(corpo.erro.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(r.body).not.toMatch(/segredo-interno|select|stack|\bat \w+/i)
  })

  it('S75: POST /seguranca/csp aceita application/csp-report sem sessão nem CSRF e responde 204', async () => {
    const relatorio = {
      'csp-report': {
        'violated-directive': "script-src 'self'",
        'blocked-uri': 'https://x.test/a.js?token=segredo',
        'document-uri': ORIGEM,
      },
    }
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/seguranca/csp',
      headers: { 'content-type': 'application/csp-report' },
      payload: JSON.stringify(relatorio),
    })
    expect(r.statusCode).toBe(204)
    const malformado = await app.inject({
      method: 'POST',
      url: '/api/v1/seguranca/csp',
      headers: { 'content-type': 'application/csp-report' },
      payload: '{nao-e-json',
    })
    expect(malformado.statusCode).toBe(204)
  })

  it('S75: relatório maior que 8 KB dá 413 e o tipo csp-report não vale em outras rotas', async () => {
    const grande = await app.inject({
      method: 'POST',
      url: '/api/v1/seguranca/csp',
      headers: { 'content-type': 'application/csp-report' },
      payload: JSON.stringify({ x: 'a'.repeat(9000) }),
    })
    expect(grande.statusCode).toBe(413)
    const outra = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/csp-report', origin: ORIGEM },
      payload: '{}',
    })
    expect(outra.statusCode).toBe(415)
  })
})

describe('T31: https', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('acrescenta wss://, upgrade-insecure-requests e HSTS', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://vinimon.test')
    vi.resetModules()
    const { buildApp: build } = await import('../src/app')
    const { prisma } = await import('../src/lib/prisma')
    const a = await build({ logger: false })
    try {
      const r = await a.inject({ method: 'GET', url: '/api/v1/saude' })
      expect(diretivas(String(r.headers['content-security-policy']))).toEqual(cspEsperada('vinimon.test', true))
      expect(r.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains')
    } finally {
      await a.close()
      await prisma.$disconnect()
    }
  })
})
