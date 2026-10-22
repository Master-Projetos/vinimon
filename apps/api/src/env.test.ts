import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const TSX_ESM = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href
const ARQUIVO_ENV = resolve(import.meta.dirname, 'env.ts')
// Valores de desenvolvimento: decodificados contêm "troque" (recusados em production).
const DEV = {
  CSRF_SECRET: 'ZGV2LWFwZW5hcy10cm9xdWUtZW0tcHJvZHVjYW8tMDAwMQ==',
  ENCRYPTION_KEY: 'ZGV2LWFwZW5hcy10cm9xdWUtZW0tcHJvZHVjYW8tMDE=',
}
// 32 bytes aleatórios fixos em base64, sem "troque".
const SEGREDO_OK = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')
const PROD_OK = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:senhaSegura@db:5432/vinimon',
  APP_ORIGIN: 'https://helpdesk.exemplo.com',
  TRUST_PROXY: '127.0.0.1',
  CSRF_SECRET: SEGREDO_OK,
  ENCRYPTION_KEY: SEGREDO_OK,
  UPLOAD_DIR: '/var/lib/vinimon/anexos',
  API_DOCS: 'false',
}

/** Carrega env.ts num processo limpo, fora de apps/api (assim o arquivo .env local não entra). */
function carregar(variaveis: Record<string, string>) {
  const r = spawnSync(process.execPath, ['--import', TSX_ESM, '-e', `await import(${JSON.stringify(ARQUIVO_ENV)})`], {
    cwd: tmpdir(),
    env: { PATH: process.env.PATH ?? '', NODE_PATH: '', ...variaveis },
    encoding: 'utf8',
  })
  return { status: r.status, stderr: r.stderr }
}

describe('env.ts', () => {
  it('aceita uma configuração de produção válida', () => {
    expect(carregar(PROD_OK).status).toBe(0)
  })

  it('aceita desenvolvimento com os valores de exemplo', () => {
    const r = carregar({
      NODE_ENV: 'development',
      DATABASE_URL: PROD_OK.DATABASE_URL,
      APP_ORIGIN: 'http://localhost:5173',
      ...DEV,
    })
    expect(r.status).toBe(0)
  })

  // T02: em production, cada caso abaixo precisa derrubar o processo citando a chave, sem expor o valor.
  const casos: [string, Record<string, string>, string, string][] = [
    [
      'http em vez de https',
      { APP_ORIGIN: 'http://helpdesk.exemplo.com' },
      'APP_ORIGIN',
      'http://helpdesk.exemplo.com',
    ],
    ['TRUST_PROXY=true', { TRUST_PROXY: 'true' }, 'TRUST_PROXY', ''],
    ['TRUST_PROXY ausente', { TRUST_PROXY: '' }, 'TRUST_PROXY', ''],
    [
      'CSRF_SECRET curto',
      { CSRF_SECRET: Buffer.from('curto').toString('base64') },
      'CSRF_SECRET',
      Buffer.from('curto').toString('base64'),
    ],
    [
      'ENCRYPTION_KEY com 16 bytes',
      { ENCRYPTION_KEY: Buffer.from('0123456789abcdef').toString('base64') },
      'ENCRYPTION_KEY',
      Buffer.from('0123456789abcdef').toString('base64'),
    ],
    ['"troque" no valor decodificado', { CSRF_SECRET: DEV.CSRF_SECRET }, 'CSRF_SECRET', DEV.CSRF_SECRET],
    ['API_DOCS=true', { API_DOCS: 'true' }, 'API_DOCS', ''],
    ['UPLOAD_DIR relativo', { UPLOAD_DIR: './storage' }, 'UPLOAD_DIR', ''],
  ]

  it.each(casos)('T02: recusa %s', (_nome, mudanca, chave, valorSecreto) => {
    const variaveis: Record<string, string> = { ...PROD_OK, ...mudanca }
    if (variaveis.TRUST_PROXY === '') delete variaveis.TRUST_PROXY
    const r = carregar(variaveis)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain(chave)
    if (valorSecreto) expect(r.stderr).not.toContain(valorSecreto)
  })

  it('T48: UPLOAD_DIR dentro do build do front é recusado', () => {
    const r = carregar({
      ...PROD_OK,
      NODE_ENV: 'development',
      APP_ORIGIN: 'http://localhost:5173',
      WEB_DIST_DIR: '/srv/web/dist',
      UPLOAD_DIR: '/srv/web/dist/x',
    })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('UPLOAD_DIR')
  })
})
