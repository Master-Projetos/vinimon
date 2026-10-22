import { existsSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import { z } from 'zod'

// Carrega apps/api/.env; variáveis já definidas no ambiente têm prioridade.
if (existsSync('.env')) process.loadEnvFile('.env')

const PROIBIDO = /troque|changeme/i
const decodificar = (v: string) => Buffer.from(v, 'base64').toString('utf8')
const ehBase64 = (v: string) => /^[A-Za-z0-9+/]+={0,2}$/.test(v)

const segredoBase64 = (minimo: number, maximo: number) =>
  z.string().refine(
    (v) => {
      const n = Buffer.from(v, 'base64').length
      return ehBase64(v) && n >= minimo && n <= maximo
    },
    {
      error: minimo === maximo ? `use base64 de exatamente ${minimo} bytes` : `use base64 de ao menos ${minimo} bytes`,
    },
  )

const IP_OU_CIDR = /^(?=.*[.:])[0-9a-fA-F:.]+(\/\d{1,3})?$/

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    APP_ORIGIN: z
      .url({ protocol: /^https?$/ })
      .refine((v) => new URL(v).origin === v, { error: 'use só a origem, sem caminho nem barra final' }),
    TRUST_PROXY: z.string().trim().optional(),
    CSRF_SECRET: segredoBase64(32, 1024),
    ENCRYPTION_KEY: segredoBase64(32, 32),
    UPLOAD_DIR: z.string().min(1).default('./storage/anexos'),
    MAX_ANEXO_MB: z.coerce.number().int().min(1).max(25).default(10),
    WEB_DIST_DIR: z.string().min(1).optional(),
    API_DOCS: z.stringbool().default(false),
    JOBS_HABILITADOS: z.stringbool().default(true),
    SOCKET_REVALIDAR_MS: z.coerce.number().int().min(100).max(600_000).default(60_000),
    SEED_ADMIN_PASSWORD: z.string().min(12).max(128).optional(),
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    MAIL_FROM: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    const erro = (campo: string, mensagem: string) => ctx.addIssue({ code: 'custom', path: [campo], message: mensagem })
    const tp = e.TRUST_PROXY ?? 'false'
    if (tp === 'true') erro('TRUST_PROXY', 'use "false" ou uma lista de IPs/CIDRs; "true" é proibido')
    else if (tp !== 'false' && !tp.split(',').every((p) => IP_OU_CIDR.test(p.trim())))
      erro('TRUST_PROXY', 'lista de IPs/CIDRs inválida')
    const upload = resolve(e.UPLOAD_DIR)
    for (const dist of [e.WEB_DIST_DIR, '../web/dist']) {
      if (dist && (upload === resolve(dist) || upload.startsWith(resolve(dist) + sep)))
        erro('UPLOAD_DIR', 'não pode ficar dentro do build do front')
    }
    if (e.NODE_ENV !== 'production') return
    if (!e.APP_ORIGIN.startsWith('https://')) erro('APP_ORIGIN', 'precisa ser https em produção')
    if (e.TRUST_PROXY === undefined) erro('TRUST_PROXY', 'obrigatória em produção')
    if (!isAbsolute(e.UPLOAD_DIR)) erro('UPLOAD_DIR', 'precisa ser absoluto em produção')
    if (e.API_DOCS) erro('API_DOCS', 'documentação desligada em produção')
    for (const campo of ['CSRF_SECRET', 'ENCRYPTION_KEY'] as const) {
      if (PROIBIDO.test(e[campo]) || PROIBIDO.test(decodificar(e[campo])))
        erro(campo, 'valor de exemplo não pode ir para produção')
    }
    if (e.SEED_ADMIN_PASSWORD && PROIBIDO.test(e.SEED_ADMIN_PASSWORD)) erro('SEED_ADMIN_PASSWORD', 'valor de exemplo')
    if (PROIBIDO.test(e.DATABASE_URL)) erro('DATABASE_URL', 'senha de exemplo')
  })
  .transform((e) => ({
    ...e,
    TRUST_PROXY:
      e.TRUST_PROXY === undefined || e.TRUST_PROXY === 'false'
        ? (false as const)
        : e.TRUST_PROXY.split(',').map((p) => p.trim()),
    UPLOAD_DIR: resolve(e.UPLOAD_DIR),
    HTTPS: e.APP_ORIGIN.startsWith('https://'),
  }))

const resultado = EnvSchema.safeParse(process.env)
if (!resultado.success) {
  // Só nomes de chave e mensagens (sem valores).
  console.error(`Variáveis de ambiente inválidas:\n${z.prettifyError(resultado.error)}`)
  process.exit(1)
}

export const env = resultado.data
export type Env = typeof env
