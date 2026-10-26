import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ehAssetEstatico, ehSourceMap, spaPlugin } from './spa'

describe('ehAssetEstatico', () => {
  it('isenta só leituras de /assets/ do rate limit por IP', () => {
    expect(ehAssetEstatico('GET', '/assets/index-B9_cSD0j.js')).toBe(true)
    expect(ehAssetEstatico('HEAD', '/assets/estilo-1.css')).toBe(true)
    expect(ehAssetEstatico('POST', '/assets/index.js')).toBe(false)
    expect(ehAssetEstatico('GET', '/api/v1/auth/sessao')).toBe(false)
    expect(ehAssetEstatico('GET', '/login')).toBe(false)
    expect(ehAssetEstatico('GET', '/api/v1/assets/x')).toBe(false)
  })
})

describe('S81: mapas de código não são servidos', () => {
  let pasta: string
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'vinimon-spa-'))
    await writeFile(join(pasta, 'index.html'), '<!doctype html><title>app</title>')
    await writeFile(join(pasta, 'app.js'), 'var a=1')
    await writeFile(join(pasta, 'app.js.map'), '{"version":3,"sources":["src/segredo.ts"]}')
  })
  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true })
  })

  it('reconhece .map com ou sem query', () => {
    expect(ehSourceMap('/assets/index-abc.js.map')).toBe(true)
    expect(ehSourceMap('/assets/index-abc.js.map?x=1')).toBe(true)
    expect(ehSourceMap('/assets/index-abc.js')).toBe(false)
    expect(ehSourceMap('/mapa')).toBe(false)
  })

  it('responde 404 ao .map existente e continua servindo o JS e o fallback do SPA', async () => {
    const app = Fastify()
    await app.register(spaPlugin, { raiz: pasta })
    const mapa = await app.inject({ method: 'GET', url: '/app.js.map' })
    expect(mapa.statusCode).toBe(404)
    expect(mapa.body).not.toContain('segredo.ts')
    expect((await app.inject({ method: 'GET', url: '/app.js' })).statusCode).toBe(200)
    const rota = await app.inject({ method: 'GET', url: '/login' })
    expect(rota.statusCode).toBe(200)
    expect(rota.body).toContain('<title>app</title>')
    await app.close()
  })
})
