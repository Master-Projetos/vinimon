import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { generate } from 'otplib'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type App, buildApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { ativarMfa, criarUsuario, limparBanco, ORIGEM } from '../test/ajudantes'
import { lerArgs } from './cli'

const RAIZ = resolve(import.meta.dirname, '..')
const TSX_ESM = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href

function rodar(script: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, ['--import', TSX_ESM, script, ...args], {
    cwd: RAIZ,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      APP_ORIGIN: process.env.APP_ORIGIN ?? '',
      CSRF_SECRET: process.env.CSRF_SECRET ?? '',
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? '',
      ...env,
    },
  })
  return { status: r.status, out: r.stdout, err: r.stderr }
}

describe('lerArgs', () => {
  it('descarta o "--" que o pnpm repassa e normaliza o login', () => {
    expect(lerArgs(['--', 'usuario:redefinir-senha', ' ADMIN '])).toEqual({
      comando: 'usuario:redefinir-senha',
      login: 'admin',
    })
    expect(lerArgs(['totp:codigo', 'op'])).toEqual({ comando: 'totp:codigo', login: 'op' })
  })
})

describe('seed-dev (T09)', () => {
  it('recusa rodar com NODE_ENV=production', () => {
    const r = rodar('prisma/seed-dev.ts', [], { NODE_ENV: 'production' })
    expect(r.status).toBe(1)
    expect(r.err).toMatch(/recusado/)
  })
})

describe('cli', () => {
  let app: App
  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(limparBanco)

  it('usuario:redefinir-senha imprime uma senha que autentica e deixa o usuário em TROCA_SENHA', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const r = rodar('scripts/cli.ts', ['usuario:redefinir-senha', u.login])
    expect(r.status, r.err).toBe(0)
    const senha = /Senha temporária de \S+: (\S+)/.exec(r.out)?.[1] ?? ''
    expect(senha).toHaveLength(16)

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json', origin: ORIGEM },
      payload: { login: u.login, senha },
    })
    expect(login.statusCode).toBe(200)
    expect(login.json().estado).toBe('TROCA_SENHA')
    const aud = await prisma.auditoria.findFirstOrThrow({ where: { acao: 'senha.redefinida' } })
    expect(aud).toMatchObject({ atorTipo: 'SISTEMA', entidadeId: String(u.id) })
    expect(JSON.stringify(aud.dados)).not.toContain(senha)
  })

  it('usuario:redefinir-senha de login inexistente sai com erro', () => {
    const r = rodar('scripts/cli.ts', ['usuario:redefinir-senha', 'fantasma'])
    expect(r.status).toBe(1)
    expect(r.err).toMatch(/não existe/)
  })

  it('totp:codigo imprime o código atual do usuário', async () => {
    const u = await criarUsuario({ perfil: 'OPERADOR' })
    const { secret } = await ativarMfa(u.id)
    const r = rodar('scripts/cli.ts', ['totp:codigo', u.login])
    expect(r.status, r.err).toBe(0)
    expect(r.out.trim()).toMatch(/^\d{6}$/)
    expect([await generate({ secret }), await generate({ secret, epoch: Date.now() - 30_000 })]).toContain(r.out.trim())
  })

  it('sem argumentos mostra a ajuda e sai com 2', () => {
    const r = rodar('scripts/cli.ts', [])
    expect(r.status).toBe(2)
    expect(r.err).toMatch(/Uso:/)
  })
})
