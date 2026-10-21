> Parte A (fundamentos), §7. Decisão fechada: não reabrir. Índice e regras de leitura em `docs/plano/README.md`.

## 7. Código canônico (copie o padrão; não "melhore")

### packages/shared/src/http.ts
```ts
import { z } from 'zod'

export const CSRF_HEADER = 'x-csrf-token'

/** Data/hora: string ISO-8601 no JSON; Date no código (API e front, via schema.parse). */
export const zDataHora = () =>
  z.codec(z.iso.datetime({ offset: true }), z.date(), {
    decode: (iso) => new Date(iso),
    encode: (data) => data.toISOString(),
  })

export const zId = () => z.coerce.number().int().positive().max(2_147_483_647)
export const IdParamsSchema = z.object({ id: zId() })
export const UuidParamsSchema = z.object({ id: z.uuid() })

/** Lista de ids na querystring: aceita ?x=1&x=2 e ?x=1. */
export const zListaIds = () =>
  z.preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(zId()).max(50).optional())

export const PaginacaoQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
})
export type PaginacaoQuery = z.output<typeof PaginacaoQuerySchema>

export const paginaDe = <T extends z.ZodType>(item: T) =>
  z.object({ itens: z.array(item), total: z.int().min(0), pagina: z.int().min(1), porPagina: z.int().min(1) })

export const CursorQuerySchema = z.object({
  antesDe: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
})
export const cursorDe = <T extends z.ZodType>(item: T) =>
  z.object({ itens: z.array(item), proximoCursor: z.int().nullable() })

export const CODIGOS_ERRO = [
  'VALIDACAO', 'REQUISICAO_INVALIDA', 'NAO_AUTENTICADO', 'MFA_PENDENTE', 'TROCA_SENHA_OBRIGATORIA', 'SEM_PERMISSAO',
  'ORIGEM_INVALIDA', 'CSRF_INVALIDO', 'NAO_ENCONTRADO', 'ROTA_INEXISTENTE', 'CONFLITO', 'REGISTRO_EM_USO',
  'REFERENCIA_INVALIDA', 'REGRA_NEGOCIO', 'ARQUIVO_GRANDE', 'TIPO_ARQUIVO_INVALIDO', 'CONTEUDO_NAO_SUPORTADO',
  'MUITAS_TENTATIVAS', 'INDISPONIVEL', 'INTERNO',
] as const
export type CodigoErro = (typeof CODIGOS_ERRO)[number]

export const ErroRespostaSchema = z.object({
  erro: z.object({
    codigo: z.enum(CODIGOS_ERRO),
    mensagem: z.string(),
    detalhes: z.array(z.object({ campo: z.string(), mensagem: z.string() })).optional(),
    requestId: z.string().optional(),
  }),
})
export type ErroResposta = z.output<typeof ErroRespostaSchema>

export type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export interface Contrato {
  metodo: Metodo
  /** Relativo a /api/v1, no formato do Fastify (ex.: '/areas/:id'). */
  caminho: `/${string}`
  params?: z.ZodType
  query?: z.ZodType
  body?: z.ZodType
  resposta: z.ZodType
  status?: 200 | 201 | 204
}
export const contrato = <const C extends Contrato>(c: C): C => c
```

### packages/shared/src/permissoes.ts
```ts
export const PERFIS = ['ADMIN', 'OPERADOR', 'USUARIO'] as const
export type Perfil = (typeof PERFIS)[number]
export const ROTULOS_PERFIL: Record<Perfil, string> = { ADMIN: 'Administrador', OPERADOR: 'Operador', USUARIO: 'Usuário' }

export const PERMISSOES = [
  'chamado.abrir', 'chamado.abrirEmNome', 'chamado.verArea', 'chamado.verTodos', 'chamado.comentar',
  'chamado.verInterno', 'chamado.atender', 'anexo.enviar', 'painel.ver', 'relatorio.ver', 'inventario.ver',
  'inventario.gerenciar', 'conhecimento.verInterno', 'conhecimento.gerenciar', 'usuario.buscar',
  'cadastro.gerenciar', 'usuario.gerenciar', 'config.gerenciar', 'auditoria.ver', 'sessao.revogarQualquer',
] as const
export type Permissao = (typeof PERMISSOES)[number]

const DO_USUARIO: readonly Permissao[] = ['chamado.abrir', 'chamado.comentar', 'anexo.enviar', 'painel.ver']
const DO_OPERADOR: readonly Permissao[] = [
  ...DO_USUARIO, 'chamado.abrirEmNome', 'chamado.verArea', 'chamado.verInterno', 'chamado.atender', 'relatorio.ver',
  'inventario.ver', 'inventario.gerenciar', 'conhecimento.verInterno', 'conhecimento.gerenciar', 'usuario.buscar',
]

export const PERMISSOES_POR_PERFIL: Record<Perfil, ReadonlySet<Permissao>> = {
  ADMIN: new Set(PERMISSOES),
  OPERADOR: new Set(DO_OPERADOR),
  USUARIO: new Set(DO_USUARIO),
}

export const temPermissao = (perfil: Perfil, permissao: Permissao): boolean => PERMISSOES_POR_PERFIL[perfil].has(permissao)
/** 2FA obrigatório (S26). */
export const exigeMfa = (perfil: Perfil): boolean => perfil !== 'USUARIO'
```

### packages/shared/src/enums.ts (trecho; um array `as const` por enum do Prisma)
```ts
export const ESTADOS_SESSAO = ['PENDENTE_MFA', 'CADASTRO_MFA', 'TROCA_SENHA', 'ATIVA'] as const
export type EstadoSessao = (typeof ESTADOS_SESSAO)[number]
export const TIPOS_STATUS = ['ABERTO', 'EM_ATENDIMENTO', 'PENDENTE', 'AGENDADO', 'CONCLUIDO', 'ENCERRADO'] as const
export type TipoStatus = (typeof TIPOS_STATUS)[number]
export const NOTAS_AVALIACAO = ['OTIMO', 'BOM', 'REGULAR', 'RUIM'] as const
export type NotaAvaliacao = (typeof NOTAS_AVALIACAO)[number]
export const TEMAS = ['CLARO', 'ESCURO', 'SISTEMA'] as const
export const DENSIDADES = ['CONFORTAVEL', 'COMPACTA'] as const
// + PAPEIS_STATUS, TIPOS_EVENTO, TIPOS_NOTIFICACAO, SITUACOES_ATIVO, SITUACOES_ARTIGO, VISIBILIDADES_ARTIGO, PRESENCAS_MANUAIS
// apps/api/src/lib/enums-check.ts confere em tempo de compilação que cada união é igual ao enum gerado pelo Prisma.
```

### packages/shared/src/zod.ts
```ts
import { z } from 'zod'

/** Mensagens de erro em pt-BR. O jitless do front vem de public/theme-init.js (window.__zod_globalConfig). */
export function configurarZod(): void {
  z.config(z.locales.ptBR())
}
```

### packages/shared/src/config.ts
```ts
import { z } from 'zod'
import { NOTAS_AVALIACAO } from './enums'

const CAMPOS = {
  'sistema.nome': z.string().trim().min(2).max(60),
  'sistema.organizacao': z.string().trim().min(2).max(120),
  'sistema.fusoHorario': z.string().regex(/^[A-Za-z_]+\/[A-Za-z_/]+$/),
  'sessao.horasAbsoluta': z.int().min(1).max(72),
  'sessao.minutosInatividade': z.int().min(15).max(480),
  'anexos.habilitados': z.boolean(),
  'anexos.tamanhoMaxMb': z.int().min(1).max(25),
  'anexos.maxPorEnvio': z.int().min(1).max(5),
  'sla.jornadaPadraoId': z.int().positive().nullable(),
  'sla.alertaPct': z.int().min(50).max(95),
  'chamado.primeiraRespostaAoEncaminhar': z.enum(['SEMPRE', 'NUNCA', 'ESCOLHA']),
  'chamado.prazoValidacaoDias': z.int().min(0).max(30),
  'chamado.prazoValidacaoDiasUteis': z.boolean(),
  'chamado.avaliacaoAutomatica': z.enum(NOTAS_AVALIACAO),
  'chamado.permitirReabertura': z.boolean(),
  'chamado.prazoReaberturaDias': z.int().min(0).max(365),
  'notificacoes.retencaoDias': z.int().min(30).max(365),
}

export const ConfigSchema = z.object(CAMPOS)
export type Config = z.output<typeof ConfigSchema>
export type ChaveConfig = keyof Config

export const CONFIG_PADRAO: Config = {
  'sistema.nome': 'Vinimon',
  'sistema.organizacao': 'Minha Empresa',
  'sistema.fusoHorario': 'America/Sao_Paulo',
  'sessao.horasAbsoluta': 12,
  'sessao.minutosInatividade': 60,
  'anexos.habilitados': true,
  'anexos.tamanhoMaxMb': 10,
  'anexos.maxPorEnvio': 5,
  'sla.jornadaPadraoId': null,
  'sla.alertaPct': 80,
  'chamado.primeiraRespostaAoEncaminhar': 'ESCOLHA',
  'chamado.prazoValidacaoDias': 3,
  'chamado.prazoValidacaoDiasUteis': true,
  'chamado.avaliacaoAutomatica': 'OTIMO',
  'chamado.permitirReabertura': true,
  'chamado.prazoReaberturaDias': 0,
  'notificacoes.retencaoDias': 180,
}

/** PATCH /config: só as chaves enviadas; chave desconhecida = 400. */
export const AtualizarConfigSchema = z.strictObject(CAMPOS).partial()

export const CHAVES_CONFIG_PUBLICAS = [
  'sistema.nome', 'sistema.organizacao', 'anexos.habilitados', 'anexos.tamanhoMaxMb', 'anexos.maxPorEnvio',
  'chamado.permitirReabertura', 'chamado.prazoReaberturaDias', 'chamado.primeiraRespostaAoEncaminhar',
] as const satisfies readonly ChaveConfig[]
```

### packages/shared/src/modulos/areas.ts
```ts
import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora } from '../http'

export const AreaSchema = z.object({
  id: z.int(),
  nome: z.string(),
  atende: z.boolean(),
  ativo: z.boolean(),
  jornadaId: z.int().nullable(),
  criadoEm: zDataHora(),
  atualizadoEm: zDataHora(),
})
export type Area = z.output<typeof AreaSchema>

export const CriarAreaSchema = z.strictObject({
  nome: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(120, 'Use no máximo 120 caracteres.'),
  atende: z.boolean(),
  ativo: z.boolean(),
  jornadaId: z.int().positive().nullable(),
})
export type CriarArea = z.output<typeof CriarAreaSchema>

export const AtualizarAreaSchema = CriarAreaSchema.partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  'Informe ao menos um campo.',
)
export type AtualizarArea = z.output<typeof AtualizarAreaSchema>

export const ListarAreasQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
  ordem: z.enum(['nome', 'criadoEm']).default('nome'),
  direcao: z.enum(['asc', 'desc']).default('asc'),
})
export type ListarAreasQuery = z.output<typeof ListarAreasQuerySchema>

export const areasApi = {
  listar: contrato({ metodo: 'GET', caminho: '/areas', query: ListarAreasQuerySchema, resposta: paginaDe(AreaSchema) }),
  obter: contrato({ metodo: 'GET', caminho: '/areas/:id', params: IdParamsSchema, resposta: AreaSchema }),
  criar: contrato({ metodo: 'POST', caminho: '/areas', body: CriarAreaSchema, resposta: AreaSchema, status: 201 }),
  atualizar: contrato({
    metodo: 'PATCH', caminho: '/areas/:id', params: IdParamsSchema, body: AtualizarAreaSchema, resposta: AreaSchema,
  }),
  excluir: contrato({ metodo: 'DELETE', caminho: '/areas/:id', params: IdParamsSchema, resposta: z.undefined(), status: 204 }),
}
```

### packages/shared/src/index.ts
```ts
export * from './config'
export * from './enums'
export * from './http'
export * from './permissoes'
export * from './zod'
export * from './modulos/areas'
// cada módulo novo: + export * from './modulos/<modulo>'
```

### apps/api/src/env.ts
```ts
import { existsSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import { z } from 'zod'

// Carrega apps/api/.env; variáveis já definidas no ambiente têm prioridade.
if (existsSync('.env')) process.loadEnvFile('.env')

const PROIBIDO = /troque|changeme/i
const decodificar = (v: string) => Buffer.from(v, 'base64').toString('utf8')
const ehBase64 = (v: string) => /^[A-Za-z0-9+/]+={0,2}$/.test(v)

const segredoBase64 = (minimo: number, maximo: number) =>
  z.string().refine((v) => {
    const n = Buffer.from(v, 'base64').length
    return ehBase64(v) && n >= minimo && n <= maximo
  }, { error: minimo === maximo ? `use base64 de exatamente ${minimo} bytes` : `use base64 de ao menos ${minimo} bytes` })

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
    else if (tp !== 'false' && !tp.split(',').every((p) => IP_OU_CIDR.test(p.trim()))) erro('TRUST_PROXY', 'lista de IPs/CIDRs inválida')
    const upload = resolve(e.UPLOAD_DIR)
    for (const dist of [e.WEB_DIST_DIR, '../web/dist']) {
      if (dist && (upload === resolve(dist) || upload.startsWith(resolve(dist) + sep))) erro('UPLOAD_DIR', 'não pode ficar dentro do build do front')
    }
    if (e.NODE_ENV !== 'production') return
    if (!e.APP_ORIGIN.startsWith('https://')) erro('APP_ORIGIN', 'precisa ser https em produção')
    if (e.TRUST_PROXY === undefined) erro('TRUST_PROXY', 'obrigatória em produção')
    if (!isAbsolute(e.UPLOAD_DIR)) erro('UPLOAD_DIR', 'precisa ser absoluto em produção')
    if (e.API_DOCS) erro('API_DOCS', 'documentação desligada em produção')
    for (const campo of ['CSRF_SECRET', 'ENCRYPTION_KEY'] as const) {
      if (PROIBIDO.test(e[campo]) || PROIBIDO.test(decodificar(e[campo]))) erro(campo, 'valor de exemplo não pode ir para produção')
    }
    if (e.SEED_ADMIN_PASSWORD && PROIBIDO.test(e.SEED_ADMIN_PASSWORD)) erro('SEED_ADMIN_PASSWORD', 'valor de exemplo')
    if (PROIBIDO.test(e.DATABASE_URL)) erro('DATABASE_URL', 'senha de exemplo')
  })
  .transform((e) => ({
    ...e,
    TRUST_PROXY: e.TRUST_PROXY === undefined || e.TRUST_PROXY === 'false' ? (false as const) : e.TRUST_PROXY.split(',').map((p) => p.trim()),
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
```

### apps/api/src/lib/prisma.ts
```ts
import { PrismaPg } from '@prisma/adapter-pg'
import { env } from '../env'
import { PrismaClient } from '../generated/prisma/client'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: 10 })

export const prisma = new PrismaClient({
  adapter,
  // Eventos (não stdout): habilitam prisma.$on('query') nos testes de contagem de queries (T-6.8).
  log: [{ emit: 'event', level: 'query' }, { emit: 'event', level: 'warn' }],
  omit: {
    usuario: { senhaHash: true, totpSecretEnc: true, totpSecretPendenteEnc: true, buscaNorm: true },
    sessao: { tokenHash: true },
    codigoRecuperacao: { codigoHash: true },
    chamado: { buscaNorm: true },
    ativo: { buscaNorm: true },
    artigo: { buscaNorm: true },
  },
})

/** Cliente dentro de $transaction (também aceita o próprio `prisma`). */
export type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>
// NÃO chame prisma.$disconnect() dentro do buildApp: só em server.ts e test/setup.ts.
```

### apps/api/src/lib/erros.ts
```ts
import type { CodigoErro, EstadoSessao } from '@vinimon/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'

export interface DetalheErro { campo: string; mensagem: string }

export class ErroApp extends Error {
  readonly status: number
  readonly codigo: CodigoErro
  readonly detalhes: DetalheErro[] | undefined
  constructor(status: number, codigo: CodigoErro, mensagem: string, detalhes?: DetalheErro[]) {
    super(mensagem)
    this.name = 'ErroApp'
    this.status = status
    this.codigo = codigo
    this.detalhes = detalhes
  }
}

export const naoAutenticado = (m = 'Faça login para continuar.') => new ErroApp(401, 'NAO_AUTENTICADO', m)
export const loginInvalido = () => new ErroApp(401, 'NAO_AUTENTICADO', 'Login ou senha inválidos.')
export const sessaoIncompleta = (estado: EstadoSessao) =>
  estado === 'TROCA_SENHA'
    ? new ErroApp(403, 'TROCA_SENHA_OBRIGATORIA', 'Troque sua senha para continuar.')
    : new ErroApp(403, 'MFA_PENDENTE', 'Conclua a verificação em duas etapas para continuar.')
export const semPermissao = (m = 'Você não tem permissão para esta ação.') => new ErroApp(403, 'SEM_PERMISSAO', m)
export const origemInvalida = () => new ErroApp(403, 'ORIGEM_INVALIDA', 'Origem da requisição não permitida.')
export const csrfInvalido = () => new ErroApp(403, 'CSRF_INVALIDO', 'Token de segurança inválido. Recarregue a página.')
export const naoEncontrado = (m = 'Registro não encontrado.') => new ErroApp(404, 'NAO_ENCONTRADO', m)
export const conflito = (m: string) => new ErroApp(409, 'CONFLITO', m)
export const regraNegocio = (m: string) => new ErroApp(422, 'REGRA_NEGOCIO', m)
export const requisicaoInvalida = (m: string) => new ErroApp(400, 'REQUISICAO_INVALIDA', m)
export const muitasTentativas = (m: string) => new ErroApp(429, 'MUITAS_TENTATIVAS', m)

/** Código Pxxxx de erros conhecidos do Prisma (checagem estrutural). */
export function codigoPrisma(erro: unknown): string | undefined {
  if (typeof erro === 'object' && erro !== null && 'code' in erro && typeof erro.code === 'string') {
    return /^P\d{4}$/.test(erro.code) ? erro.code : undefined
  }
  return undefined
}

/**
 * Nome do índice único (o adapter pg informa `cause.constraint.index`, não `meta.target`) → campo do formulário.
 * Cada tarefa de cadastro com unique acrescenta a sua linha.
 */
export const CAMPO_POR_INDICE: Record<string, string> = {
  areas_nome_key: 'nome',
  usuarios_login_key: 'login',
  usuarios_email_key: 'email',
}

export function responderRotaInexistente(req: FastifyRequest, reply: FastifyReply) {
  return reply.code(404).send({ erro: { codigo: 'ROTA_INEXISTENTE', mensagem: 'Rota não encontrada.', requestId: req.id } })
}
```

### apps/api/src/lib/paginacao.ts e lib/like.ts
```ts
// lib/paginacao.ts
import type { PaginacaoQuery } from '@vinimon/shared'
export const paginar = ({ pagina, porPagina }: PaginacaoQuery) => ({ skip: (pagina - 1) * porPagina, take: porPagina })

// lib/like.ts — usar em TODO `contains` com texto livre (T62 garante)
export const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`)
```

### apps/api/src/lib/contexto.ts e lib/auditoria.ts
```ts
// lib/contexto.ts
import type { FastifyRequest } from 'fastify'
import { naoAutenticado } from './erros'
import type { UsuarioSessao } from './sessao'

export interface Contexto { usuario: UsuarioSessao | null; ip: string | null; userAgent: string | null; requestId: string | null }
export interface ContextoUsuario extends Contexto { usuario: UsuarioSessao }

export const contextoAnonimo = (req: FastifyRequest): Contexto => ({
  usuario: req.usuario,
  ip: req.ip,
  userAgent: req.headers['user-agent']?.slice(0, 256) ?? null,
  requestId: req.id,
})
export function contextoDe(req: FastifyRequest): ContextoUsuario {
  if (!req.usuario) throw naoAutenticado()
  return { ...contextoAnonimo(req), usuario: req.usuario }
}
export const CONTEXTO_SISTEMA: Contexto = { usuario: null, ip: null, userAgent: null, requestId: null }
```
```ts
// lib/auditoria.ts
import type { Prisma } from '../generated/prisma/client'
import type { Contexto } from './contexto'
import type { Tx } from './prisma'

export interface RegistroAuditoria {
  acao: string
  entidade: string
  entidadeId?: string | number | null
  /** Só diff/metadados; NUNCA senha, token, segredo ou código. */
  dados?: Record<string, unknown>
}

/** Converte Date e afins para JSON puro. */
export const paraJson = (valor: Record<string, unknown>): Prisma.InputJsonObject =>
  JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonObject

export async function auditar(tx: Tx, ctx: Contexto, r: RegistroAuditoria): Promise<void> {
  await tx.auditoria.create({
    data: {
      atorTipo: ctx.usuario ? 'USUARIO' : 'SISTEMA',
      atorId: ctx.usuario?.id ?? null,
      acao: r.acao,
      entidade: r.entidade,
      entidadeId: r.entidadeId === undefined || r.entidadeId === null ? null : String(r.entidadeId),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      dados: r.dados === undefined ? undefined : paraJson(r.dados),
    },
  })
}
```

### apps/api/src/lib/config.ts
```ts
import { CONFIG_PADRAO, type ChaveConfig, type Config, ConfigSchema } from '@vinimon/shared'
import { prisma } from './prisma'

let cache: { valor: Config; ate: number } | null = null

/** Lê a tabela config (cache de 30 s); chave inválida no banco cai no padrão. */
export async function obterConfig(): Promise<Config> {
  if (cache && cache.ate > Date.now()) return cache.valor
  const linhas = await prisma.config.findMany()
  const valor: Config = { ...CONFIG_PADRAO }
  const campos = ConfigSchema.shape
  for (const linha of linhas) {
    if (!Object.hasOwn(campos, linha.chave)) continue
    const chave = linha.chave as ChaveConfig
    const r = campos[chave].safeParse(linha.valor)
    if (r.success) Object.assign(valor, { [chave]: r.data })
  }
  cache = { valor, ate: Date.now() + 30_000 }
  return valor
}

export const invalidarConfig = (): void => {
  cache = null
}
```

### apps/api/src/lib/tempo-real.ts (porta; a implementação real é registrada pelo realtime/plugin.ts)
```ts
export type MotivoEncerramento = 'logout' | 'revogada' | 'expirada' | 'usuario_desativado'

export interface PublicadorTempoReal {
  encerrarSessao(sessaoId: string, motivo: MotivoEncerramento): void
  encerrarSessoesDoUsuario(usuarioId: number, motivo: MotivoEncerramento): void
  revalidarUsuario(usuarioId: number): void
  revalidarChamado(chamadoId: number): void
  // emitirAssentamento, emitirChamadoAtualizado, emitirFila, emitirLeitura, emitirNotificacoes, emitirContagem (seção 3.7)
}

const publicadorNulo: PublicadorTempoReal = {
  encerrarSessao: () => undefined,
  encerrarSessoesDoUsuario: () => undefined,
  revalidarUsuario: () => undefined,
  revalidarChamado: () => undefined,
}

export let tempoReal: PublicadorTempoReal = publicadorNulo
export function definirTempoReal(p: PublicadorTempoReal): void {
  tempoReal = p
}
```

### apps/api/src/lib/senha.ts
```ts
import { randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { hash, verify } from '@node-rs/argon2'

/** OWASP mínimo. O padrão da lib já é Argon2id (não importe o const enum Algorithm). */
export const ARGON2_PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const

const scryptAsync = promisify(scrypt) as (senha: string, salt: string, tamanho: number) => Promise<Buffer>
const LEGADO = /^([0-9a-f]{32}):([0-9a-f]{128})$/
const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/
let hashFicticio: Promise<string> | undefined

export const hashSenha = (senha: string): Promise<string> => hash(senha, ARGON2_PARAMS)

export function precisaRehash(armazenado: string): boolean {
  const m = PHC.exec(armazenado)
  if (!m) return true
  return Number(m[1]) !== ARGON2_PARAMS.memoryCost || Number(m[2]) !== ARGON2_PARAMS.timeCost || Number(m[3]) !== ARGON2_PARAMS.parallelism
}

/** Aceita argon2id e o legado "salt:hash" (scrypt, keylen 64) da v1. `null` verifica contra hash fictício (anti-enumeração). */
export async function verificarSenha(senha: string, armazenado: string | null): Promise<{ ok: boolean; precisaRehash: boolean }> {
  if (armazenado === null) {
    hashFicticio ??= hashSenha(randomUUID())
    await verify(await hashFicticio, senha).catch(() => false)
    return { ok: false, precisaRehash: false }
  }
  const legado = LEGADO.exec(armazenado)
  if (legado) {
    const saltHex = legado[1] ?? ''
    const hashHex = legado[2] ?? ''
    // v1 usava a STRING hex do salt como salt (não os bytes), com N=16384, r=8, p=1 (padrão do Node).
    const calculado = await scryptAsync(senha, saltHex, 64)
    const ok = timingSafeEqual(calculado, Buffer.from(hashHex, 'hex'))
    return { ok, precisaRehash: ok }
  }
  if (!armazenado.startsWith('$argon2id$')) return { ok: false, precisaRehash: false }
  const ok = await verify(armazenado, senha).catch(() => false)
  return { ok, precisaRehash: ok && precisaRehash(armazenado) }
}
```

### apps/api/src/lib/sessao.ts
```ts
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { CookieSerializeOptions } from '@fastify/cookie'
import type { EstadoSessao, Perfil } from '@vinimon/shared'
import { env } from '../env'
import { obterConfig } from './config'
import { prisma, type Tx } from './prisma'
import { type MotivoEncerramento, tempoReal } from './tempo-real'

export interface UsuarioSessao {
  id: number
  nome: string
  login: string
  perfil: Perfil
  areaId: number | null
  /** área primária + secundárias (escopo) */
  areaIds: number[]
  sessaoId: string
  estado: EstadoSessao
  mfaAtivo: boolean
}

export type MotivoRevogacao =
  | 'logout' | 'inatividade' | 'troca_senha' | 'senha_redefinida' | 'usuario_desativado' | 'perfil_alterado'
  | 'mfa_alterado' | 'admin' | 'limite' | 'mfa_falhas' | 'encerrar_todas'

export const NOME_COOKIE = env.HTTPS ? '__Host-vinimon_sid' : 'vinimon_sid'
const MAX_SESSOES = 10
const PENDENTE_MS = 10 * 60_000
const TOQUE_MS = 60_000
const TOKEN = /^[A-Za-z0-9_-]{43}$/
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')
const novoToken = () => randomBytes(32).toString('base64url')
const motivoSocket = (m: MotivoRevogacao): MotivoEncerramento =>
  m === 'logout' ? 'logout' : m === 'inatividade' ? 'expirada' : m === 'usuario_desativado' ? 'usuario_desativado' : 'revogada'

export function csrfDaSessao(sessaoId: string): string {
  return createHmac('sha256', Buffer.from(env.CSRF_SECRET, 'base64')).update(sessaoId).digest('base64url')
}
export function csrfValido(recebido: string, sessaoId: string): boolean {
  const esperado = Buffer.from(csrfDaSessao(sessaoId))
  const r = Buffer.from(recebido)
  return r.length === esperado.length && timingSafeEqual(r, esperado)
}

async function expiracao(estado: EstadoSessao, agora: Date): Promise<Date> {
  if (estado !== 'ATIVA') return new Date(agora.getTime() + PENDENTE_MS)
  const cfg = await obterConfig()
  return new Date(agora.getTime() + cfg['sessao.horasAbsoluta'] * 3_600_000)
}

export async function criarSessao(
  d: { usuarioId: number; estado: EstadoSessao; ip: string | null; userAgent: string | null },
  agora = new Date(),
) {
  const token = novoToken()
  const expiraEm = await expiracao(d.estado, agora)
  const r = await prisma.$transaction(async (tx) => {
    const criada = await tx.sessao.create({
      data: {
        usuarioId: d.usuarioId, tokenHash: sha256(token), estado: d.estado, expiraEm, ultimoUsoEm: agora,
        ip: d.ip, userAgent: d.userAgent?.slice(0, 256) ?? null,
      },
      select: { id: true },
    })
    const ativas = await tx.sessao.findMany({
      where: { usuarioId: d.usuarioId, revogadaEm: null, expiraEm: { gt: agora } },
      orderBy: { criadaEm: 'desc' },
      select: { id: true },
    })
    const excedentes = ativas.slice(MAX_SESSOES).map((s) => s.id)
    if (excedentes.length > 0) {
      await tx.sessao.updateMany({ where: { id: { in: excedentes } }, data: { revogadaEm: agora, motivoRevogacao: 'limite' } })
    }
    return { sessaoId: criada.id, excedentes }
  })
  for (const id of r.excedentes) tempoReal.encerrarSessao(id, 'revogada')
  return { sessaoId: r.sessaoId, token, expiraEm }
}

/** Fim do MFA / troca de senha: NOVO token na mesma linha (o csrf não muda: depende do id). */
export async function promoverSessao(sessaoId: string, estado: EstadoSessao, agora = new Date()) {
  const token = novoToken()
  const expiraEm = await expiracao(estado, agora)
  await prisma.sessao.update({ where: { id: sessaoId }, data: { tokenHash: sha256(token), estado, expiraEm, ultimoUsoEm: agora } })
  return { token, expiraEm }
}

export async function carregarSessao(token: string | undefined, opcoes: { tocar?: boolean } = {}): Promise<UsuarioSessao | null> {
  if (token === undefined || !TOKEN.test(token)) return null
  const agora = new Date()
  const s = await prisma.sessao.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true, estado: true, expiraEm: true, ultimoUsoEm: true, revogadaEm: true,
      usuario: {
        select: {
          id: true, nome: true, login: true, perfil: true, areaId: true, ativo: true, mfaAtivadoEm: true,
          areasSecundarias: { select: { areaId: true } },
        },
      },
    },
  })
  if (!s || s.revogadaEm !== null || s.expiraEm.getTime() <= agora.getTime() || !s.usuario.ativo) return null
  const limite = s.estado === 'ATIVA' ? (await obterConfig())['sessao.minutosInatividade'] * 60_000 : PENDENTE_MS
  const ocioso = agora.getTime() - s.ultimoUsoEm.getTime()
  if (ocioso > limite) {
    await revogarSessao(s.id, 'inatividade')
    return null
  }
  if ((opcoes.tocar ?? true) && ocioso > TOQUE_MS) {
    await prisma.sessao.update({ where: { id: s.id }, data: { ultimoUsoEm: agora } })
  }
  const u = s.usuario
  const secundarias = u.areasSecundarias.map((a) => a.areaId)
  return {
    id: u.id, nome: u.nome, login: u.login, perfil: u.perfil, areaId: u.areaId,
    areaIds: u.areaId === null ? secundarias : [u.areaId, ...secundarias],
    sessaoId: s.id, estado: s.estado, mfaAtivo: u.mfaAtivadoEm !== null,
  }
}

/** Revoga uma sessão e derruba os sockets dela (fora de transação). */
export async function revogarSessao(id: string, motivo: MotivoRevogacao): Promise<void> {
  await prisma.sessao.updateMany({ where: { id, revogadaEm: null }, data: { revogadaEm: new Date(), motivoRevogacao: motivo } })
  tempoReal.encerrarSessao(id, motivoSocket(motivo))
}

/** Dentro de transação: só grava. Depois do commit chame desconectarSessoes(ids, motivo). */
export async function revogarSessoesDoUsuario(tx: Tx, usuarioId: number, motivo: MotivoRevogacao, exceto?: string): Promise<string[]> {
  const alvo = await tx.sessao.findMany({
    where: { usuarioId, revogadaEm: null, ...(exceto ? { id: { not: exceto } } : {}) },
    select: { id: true },
  })
  const ids = alvo.map((s) => s.id)
  if (ids.length > 0) await tx.sessao.updateMany({ where: { id: { in: ids } }, data: { revogadaEm: new Date(), motivoRevogacao: motivo } })
  return ids
}
export function desconectarSessoes(ids: readonly string[], motivo: MotivoRevogacao): void {
  for (const id of ids) tempoReal.encerrarSessao(id, motivoSocket(motivo))
}

export function opcoesCookie(expiraEm: Date): CookieSerializeOptions {
  return {
    path: '/', httpOnly: true, secure: env.HTTPS, sameSite: 'strict',
    maxAge: Math.max(0, Math.floor((expiraEm.getTime() - Date.now()) / 1000)),
  }
}
export const opcoesLimparCookie = (): CookieSerializeOptions => ({ path: '/', httpOnly: true, secure: env.HTTPS, sameSite: 'strict' })
```

### apps/api/src/plugins/erros.ts
```ts
import type { CodigoErro } from '@vinimon/shared'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod'
import { CAMPO_POR_INDICE, codigoPrisma, type DetalheErro, ErroApp } from '../lib/erros'

type CausaAdapter = { cause?: { originalCode?: string; constraint?: { index?: string; fields?: string[] } } }
/** Com driver adapter, `meta = { driverAdapterError, table }` (sem `meta.target`). */
function causaAdapter(erro: unknown): CausaAdapter['cause'] {
  if (typeof erro !== 'object' || erro === null || !('meta' in erro)) return undefined
  const meta = erro.meta as { driverAdapterError?: unknown } | undefined
  return (meta?.driverAdapterError as CausaAdapter | undefined)?.cause
}

function responder(req: FastifyRequest, reply: FastifyReply, status: number, codigo: CodigoErro, mensagem: string, detalhes?: DetalheErro[]) {
  return reply.code(status).send({ erro: { codigo, mensagem, detalhes, requestId: req.id } })
}

export const errosPlugin = fp(
  async (app) => {
    app.setErrorHandler((erro: FastifyError, req, reply) => {
      if (erro instanceof ErroApp) return responder(req, reply, erro.status, erro.codigo, erro.message, erro.detalhes)

      if (hasZodFastifySchemaValidationErrors(erro)) {
        const detalhes = erro.validation.map((v) => ({
          campo: v.instancePath.replace(/^\//, '').replaceAll('/', '.') || (erro.validationContext ?? 'corpo'),
          mensagem: v.message ?? 'Valor inválido.',
        }))
        return responder(req, reply, 400, 'VALIDACAO', 'Verifique os campos informados.', detalhes)
      }

      const causa = causaAdapter(erro)
      switch (codigoPrisma(erro)) {
        case 'P2002': {
          const campo = CAMPO_POR_INDICE[causa?.constraint?.index ?? '']
          const detalhes = campo ? [{ campo, mensagem: 'Já existe um registro com este valor.' }] : []
          return responder(req, reply, 409, 'CONFLITO', 'Já existe um registro com esse valor.', detalhes)
        }
        // Códigos do Postgres sem tradução no adapter: P2039 (client) e P2010 ($queryRaw/$executeRaw).
        case 'P2039':
        case 'P2010':
          if (causa?.originalCode === '23P01') return responder(req, reply, 409, 'CONFLITO', 'O registro conflita com outro existente.')
          if (causa?.originalCode === '23514') return responder(req, reply, 422, 'VALIDACAO', 'Os dados violam uma regra de integridade.')
          break
        case 'P2025': return responder(req, reply, 404, 'NAO_ENCONTRADO', 'Registro não encontrado.')
        case 'P2034': return responder(req, reply, 409, 'CONFLITO', 'Conflito de concorrência. Tente novamente.')
        case 'P2003':
          return req.method === 'DELETE'
            ? responder(req, reply, 409, 'REGISTRO_EM_USO', 'Registro em uso por outros dados. Desative-o em vez de excluir.')
            : responder(req, reply, 422, 'REFERENCIA_INVALIDA', 'Um dos registros relacionados não existe.')
      }

      if (isResponseSerializationError(erro)) {
        req.log.error({ err: erro, issues: erro.cause.issues }, 'resposta fora do schema')
        return responder(req, reply, 500, 'INTERNO', 'Erro interno do servidor.')
      }

      const status = erro.statusCode ?? 500
      if (status === 429) return responder(req, reply, 429, 'MUITAS_TENTATIVAS', 'Muitas requisições. Aguarde e tente novamente.')
      if (status === 413) return responder(req, reply, 413, 'ARQUIVO_GRANDE', 'Arquivo ou requisição maior que o permitido.')
      if (status === 415) return responder(req, reply, 415, 'CONTEUDO_NAO_SUPORTADO', 'Tipo de conteúdo não suportado.')
      if (status === 503) return responder(req, reply, 503, 'INDISPONIVEL', 'Servidor sobrecarregado. Tente novamente em instantes.')
      if (status >= 400 && status < 500) return responder(req, reply, status, 'REQUISICAO_INVALIDA', 'Requisição inválida.')

      req.log.error({ err: erro }, 'erro não tratado')
      return responder(req, reply, 500, 'INTERNO', 'Erro interno do servidor.')
    })
  },
  { name: 'erros' },
)
```

### apps/api/src/plugins/autenticacao.ts
```ts
import { type EstadoSessao, type Permissao, temPermissao } from '@vinimon/shared'
import fp from 'fastify-plugin'
import { naoAutenticado, requisicaoInvalida, semPermissao, sessaoIncompleta } from '../lib/erros'
import { carregarSessao, NOME_COOKIE, type UsuarioSessao } from '../lib/sessao'

export type Acesso = 'publico' | 'autenticado' | Permissao

declare module 'fastify' {
  interface FastifyRequest {
    usuario: UsuarioSessao | null
  }
  interface FastifyContextConfig {
    /** OBRIGATÓRIO em toda rota /api/v1 (fail-closed). */
    acesso?: Acesso
    /** Estados de sessão aceitos. Padrão: ['ATIVA']. */
    estados?: readonly EstadoSessao[]
    /** false SOMENTE na rota de relatório CSP. */
    csrf?: false
  }
}

/** Carrega a sessão (onRequest) e aplica a declaração de acesso (preValidation, antes do Zod). */
export const autenticacaoPlugin = fp(
  async (app) => {
    app.decorateRequest('usuario', null)

    app.addHook('onRequest', async (req) => {
      const token = req.cookies[NOME_COOKIE]
      if (token !== undefined && req.headers.authorization !== undefined) {
        throw requisicaoInvalida('Use cookie de sessão ou token de API, nunca os dois.')
      }
      const usuario = await carregarSessao(token)
      if (usuario) {
        req.usuario = usuario
        req.log = req.log.child({ usuarioId: usuario.id })
      }
    })

    app.addHook('preValidation', async (req) => {
      const { acesso, estados = ['ATIVA'] } = req.routeOptions.config
      if (acesso === undefined) {
        req.log.error({ url: req.routeOptions.url }, 'rota sem config.acesso')
        throw semPermissao('Rota sem declaração de acesso.')
      }
      if (acesso === 'publico') return
      const u = req.usuario
      if (!u) throw naoAutenticado()
      if (!estados.includes(u.estado)) throw sessaoIncompleta(u.estado)
      if (acesso !== 'autenticado' && !temPermissao(u.perfil, acesso)) throw semPermissao()
    })
  },
  { name: 'autenticacao' },
)
```

### apps/api/src/plugins/seguranca.ts
```ts
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
```

### apps/api/src/plugins/docs.ts e plugins/spa.ts
```ts
// plugins/docs.ts — registrado só com API_DOCS=true (proibido em produção pelo env.ts)
import swagger from '@fastify/swagger'
import scalar from '@scalar/fastify-api-reference'
import fp from 'fastify-plugin'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'
import { NOME_COOKIE } from '../lib/sessao'

export const docsPlugin = fp(
  async (app) => {
    await app.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: { title: 'Vinimon API', version: '1.0.0' },
        components: { securitySchemes: { sessao: { type: 'apiKey', in: 'cookie', name: NOME_COOKIE } } },
        security: [{ sessao: [] }],
      },
      transform: jsonSchemaTransform,
    })
    await app.register(scalar, { routePrefix: '/api/docs' })
  },
  { name: 'docs' },
)
```
```ts
// plugins/spa.ts — em produção o Fastify serve apps/web/dist
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
        res.setHeader('Cache-Control', imutavel ? 'public, max-age=31536000, immutable' : 'no-cache')
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
```

### apps/api/src/app.ts
```ts
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
import { rotasAreas } from './modules/areas/routes'
import { rotasAuth } from './modules/auth/routes'
import { rotasSaude } from './modules/saude/routes'
import { autenticacaoPlugin } from './plugins/autenticacao'
import { docsPlugin } from './plugins/docs'
import { errosPlugin } from './plugins/erros'
import { segurancaPlugin } from './plugins/seguranca'
import { spaPlugin } from './plugins/spa'
import { tempoRealPlugin } from './realtime/plugin'

configurarZod()

const REDACT = [
  'req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]',
  '*.senha', '*.senhaAtual', '*.novaSenha', '*.token', '*.codigo', '*.segredo', '*.password',
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
    limits: { fileSize: env.MAX_ANEXO_MB * 1024 * 1024, files: 5, fields: 5, fieldSize: 1024, parts: 10, headerPairs: 200 },
  })
  if (env.API_DOCS) await app.register(docsPlugin)

  await app.register(
    async (api) => {
      await api.register(autenticacaoPlugin)
      await api.register(segurancaPlugin)
      await api.register(rotasAreas)
      await api.register(rotasAuth)
      await api.register(rotasSaude)
      // cada módulo novo: 1 import + 1 linha aqui (ordem alfabética)
    },
    { prefix: '/api/v1' },
  )

  await app.register(tempoRealPlugin)
  if (env.WEB_DIST_DIR) await app.register(spaPlugin, { raiz: env.WEB_DIST_DIR })
  else app.setNotFoundHandler(responderRotaInexistente)

  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>
```

### apps/api/src/server.ts
```ts
import closeWithGrace from 'close-with-grace'
import { buildApp } from './app'
import { env } from './env'
import { iniciarJobs } from './jobs'
import { prisma } from './lib/prisma'

const app = await buildApp()
const jobs = env.JOBS_HABILITADOS ? await iniciarJobs(app.log) : null

closeWithGrace({ delay: 10_000 }, async ({ signal, err }) => {
  if (err) app.log.error({ err }, 'encerrando após erro')
  else app.log.info({ signal }, 'encerrando')
  await app.close()
  await jobs?.stop({ graceful: true, timeout: 5_000 })
  await prisma.$disconnect()
})

await app.listen({ host: env.HOST, port: env.PORT })
```

### apps/api/src/modules/saude/routes.ts
```ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../../lib/prisma' // exceção documentada: rota de saúde sem service (ajuste o override do Biome só para este arquivo)

const OkSchema = z.object({ ok: z.literal(true) })

export const rotasSaude: FastifyPluginAsyncZod = async (app) => {
  app.get('/saude', { schema: { tags: ['Saúde'], response: { 200: OkSchema } }, config: { acesso: 'publico' } }, async () => ({
    ok: true as const,
  }))
  app.get('/saude/pronto', { schema: { tags: ['Saúde'], response: { 200: OkSchema } }, config: { acesso: 'publico' } }, async () => {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true as const }
  })
}
```
Decisão: para não abrir exceção no Biome, a T-tarefa de saúde cria `modules/saude/service.ts` com `verificarBanco()` e a rota importa do service. O trecho acima mostra só o formato da rota.

### apps/api/src/modules/auth/estados.ts
```ts
import { type EstadoSessao, exigeMfa, type Perfil } from '@vinimon/shared'

interface EstadoUsuario { perfil: Perfil; deveTrocarSenha: boolean; mfaAtivadoEm: Date | null }

/** Ordem obrigatória (S26): PENDENTE_MFA → TROCA_SENHA → CADASTRO_MFA → ATIVA. */
export function estadoAposSenha(u: EstadoUsuario): EstadoSessao {
  if (u.mfaAtivadoEm) return 'PENDENTE_MFA'
  return estadoAposMfa(u)
}
export function estadoAposMfa(u: EstadoUsuario): EstadoSessao {
  if (u.deveTrocarSenha) return 'TROCA_SENHA'
  return estadoAposTrocaSenha(u)
}
export function estadoAposTrocaSenha(u: EstadoUsuario): EstadoSessao {
  if (exigeMfa(u.perfil) && !u.mfaAtivadoEm) return 'CADASTRO_MFA'
  return 'ATIVA'
}
```

### apps/api/src/modules/auth/service.ts (trecho `entrar`)
```ts
import type { EntrarBody } from '@vinimon/shared'
import { auditar } from '../../lib/auditoria'
import type { Contexto } from '../../lib/contexto'
import { loginInvalido, muitasTentativas } from '../../lib/erros'
import { prisma } from '../../lib/prisma'
import { hashSenha, verificarSenha } from '../../lib/senha'
import { criarSessao } from '../../lib/sessao'
import { estadoAposSenha } from './estados'

const JANELA_MS = 15 * 60_000
const MAX_FALHAS_LOGIN = 5
const MAX_FALHAS_IP = 30

/** O schema já normalizou o login (trim + lowercase) e limitou a senha a 128. */
export async function entrar(dados: EntrarBody, ctx: Contexto & { ip: string }) {
  const login = dados.login
  const desde = new Date(Date.now() - JANELA_MS)
  const [falhasLogin, falhasIp] = await Promise.all([
    prisma.falhaLogin.count({ where: { loginNormalizado: login, criadoEm: { gte: desde } } }),
    prisma.falhaLogin.count({ where: { ip: ctx.ip, criadoEm: { gte: desde } } }),
  ])
  // Igual para login existente ou não; vale mesmo com a senha certa (S40).
  if (falhasLogin >= MAX_FALHAS_LOGIN) throw muitasTentativas('Muitas tentativas para este login. Tente novamente em 15 minutos.')
  if (falhasIp >= MAX_FALHAS_IP) throw muitasTentativas('Muitas tentativas a partir deste endereço. Tente novamente em 15 minutos.')

  const u = await prisma.usuario.findUnique({
    where: { login },
    select: { id: true, ativo: true, perfil: true, senhaHash: true, deveTrocarSenha: true, mfaAtivadoEm: true },
  })
  const candidato = u && u.ativo ? u : null
  const { ok, precisaRehash } = await verificarSenha(dados.senha, candidato?.senhaHash ?? null)

  if (!ok || candidato === null) {
    await prisma.$transaction(async (tx) => {
      await tx.falhaLogin.create({ data: { loginNormalizado: login, ip: ctx.ip } })
      await auditar(tx, ctx, { acao: 'login.falha', entidade: 'usuario', entidadeId: u?.id ?? null, dados: { login } })
      if (falhasLogin + 1 === MAX_FALHAS_LOGIN) {
        await auditar(tx, ctx, { acao: 'login.bloqueado', entidade: 'usuario', entidadeId: u?.id ?? null, dados: { login } })
      }
    })
    throw loginInvalido()
  }

  const estado = estadoAposSenha(candidato)
  const novoHash = precisaRehash ? await hashSenha(dados.senha) : null // fora da transação (custo de CPU)
  await prisma.$transaction(async (tx) => {
    if (novoHash) {
      await tx.usuario.update({ where: { id: candidato.id }, data: { senhaHash: novoHash } })
      await auditar(tx, ctx, { acao: 'senha.migrada', entidade: 'usuario', entidadeId: candidato.id })
    }
    await tx.falhaLogin.deleteMany({ where: { loginNormalizado: login } })
    if (estado === 'ATIVA') await tx.usuario.update({ where: { id: candidato.id }, data: { ultimoLoginEm: new Date() } })
    await auditar(tx, ctx, { acao: 'login.sucesso', entidade: 'usuario', entidadeId: candidato.id, dados: { estado } })
  })
  const sessao = await criarSessao({ usuarioId: candidato.id, estado, ip: ctx.ip, userAgent: ctx.userAgent })
  return { ...sessao, estado, usuarioId: candidato.id }
}
```
`EntrarBodySchema` (shared `modulos/auth.ts`): `z.strictObject({ login: z.string().trim().toLowerCase().regex(/^[a-z0-9._@-]{3,64}$/, 'Login inválido.'), senha: z.string().min(1).max(128) })`.

### apps/api/src/modules/auth/routes.ts (trecho do login)
```ts
app.route({
  method: c.entrar.metodo,
  url: c.entrar.caminho,
  schema: { tags, summary: 'Entrar', body: c.entrar.body, response: { 200: c.entrar.resposta } },
  config: { acesso: 'publico', rateLimit: { max: 10, timeWindow: '1 minute' } },
  handler: async (req, reply) => {
    const r = await service.entrar(req.body, { ...contextoAnonimo(req), ip: req.ip })
    reply.setCookie(NOME_COOKIE, r.token, opcoesCookie(r.expiraEm))
    return {
      estado: r.estado,
      csrf: csrfDaSessao(r.sessaoId),
      usuario: r.estado === 'ATIVA' ? await service.obterUsuarioMe(r.usuarioId) : null,
    }
  },
})
```

### apps/api/src/modules/areas/schemas.ts
```ts
import type { Prisma } from '../../generated/prisma/client'

export { areasApi } from '@vinimon/shared'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectArea = {
  id: true, nome: true, atende: true, ativo: true, jornadaId: true, criadoEm: true, atualizadoEm: true,
} satisfies Prisma.AreaSelect
```

### apps/api/src/modules/areas/service.ts
```ts
import type { AtualizarArea, CriarArea, ListarAreasQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { selectArea } from './schemas'

export async function listarAreas(q: ListarAreasQuery) {
  const where: Prisma.AreaWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const ordem: Record<ListarAreasQuery['ordem'], Prisma.AreaOrderByWithRelationInput> = {
    nome: { nome: q.direcao },
    criadoEm: { criadoEm: q.direcao },
  }
  const [itens, total] = await prisma.$transaction([
    prisma.area.findMany({ where, select: selectArea, orderBy: [ordem[q.ordem], { id: 'asc' }], ...paginar(q) }),
    prisma.area.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterArea(id: number) {
  const area = await prisma.area.findUnique({ where: { id }, select: selectArea })
  if (!area) throw naoEncontrado('Área não encontrada.')
  return area
}

/** Nome duplicado → P2002 → 409; jornadaId inexistente → P2003 → 422. */
export function criarArea(dados: CriarArea, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const area = await tx.area.create({
      data: { nome: dados.nome, atende: dados.atende, ativo: dados.ativo, jornadaId: dados.jornadaId },
      select: selectArea,
    })
    await auditar(tx, ctx, { acao: 'cadastro.criado', entidade: 'area', entidadeId: area.id, dados: { depois: area } })
    return area
  })
}

export function atualizarArea(id: number, dados: AtualizarArea, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.area.findUnique({ where: { id }, select: selectArea })
    if (!antes) throw naoEncontrado('Área não encontrada.')
    const depois = await tx.area.update({
      where: { id },
      data: { nome: dados.nome, atende: dados.atende, ativo: dados.ativo, jornadaId: dados.jornadaId },
      select: selectArea,
    })
    await auditar(tx, ctx, { acao: 'cadastro.alterado', entidade: 'area', entidadeId: id, dados: { antes, depois } })
    return depois
  })
}

/** Área em uso → P2003 → 409 REGISTRO_EM_USO (rollback, nada é auditado). */
export async function excluirArea(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.area.delete({ where: { id }, select: selectArea })
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'area', entidadeId: id, dados: { antes } })
  })
}
```
Observação: no `update`, campos `undefined` são ignorados pelo Prisma. O mapeamento é sempre explícito (nunca `data: dados`).

### apps/api/src/modules/areas/routes.ts
```ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { contextoDe } from '../../lib/contexto'
import { areasApi as c } from './schemas'
import * as service from './service'

const tags = ['Áreas']

export const rotasAreas: FastifyPluginAsyncZod = async (app) => {
  app.route({
    method: c.listar.metodo,
    url: c.listar.caminho,
    schema: { tags, summary: 'Lista áreas', querystring: c.listar.query, response: { 200: c.listar.resposta } },
    config: { acesso: 'cadastro.gerenciar' },
    handler: (req) => service.listarAreas(req.query),
  })

  app.route({
    method: c.obter.metodo,
    url: c.obter.caminho,
    schema: { tags, summary: 'Obtém área', params: c.obter.params, response: { 200: c.obter.resposta } },
    config: { acesso: 'cadastro.gerenciar' },
    handler: (req) => service.obterArea(req.params.id),
  })

  app.route({
    method: c.criar.metodo,
    url: c.criar.caminho,
    schema: { tags, summary: 'Cria área', body: c.criar.body, response: { 201: c.criar.resposta } },
    config: { acesso: 'cadastro.gerenciar' },
    handler: async (req, reply) => reply.code(201).send(await service.criarArea(req.body, contextoDe(req))),
  })

  app.route({
    method: c.atualizar.metodo,
    url: c.atualizar.caminho,
    schema: {
      tags, summary: 'Atualiza área', params: c.atualizar.params, body: c.atualizar.body,
      response: { 200: c.atualizar.resposta },
    },
    config: { acesso: 'cadastro.gerenciar' },
    handler: (req) => service.atualizarArea(req.params.id, req.body, contextoDe(req)),
  })

  app.route({
    method: c.excluir.metodo,
    url: c.excluir.caminho,
    schema: { tags, summary: 'Exclui área', params: c.excluir.params, response: { 204: c.excluir.resposta } },
    config: { acesso: 'cadastro.gerenciar' },
    handler: async (req, reply) => {
      await service.excluirArea(req.params.id, contextoDe(req))
      return reply.code(204).send()
    },
  })
}
```

### apps/api/vitest.config.ts e test/*
```ts
// apps/api/test/constantes.ts
import { existsSync } from 'node:fs'

if (existsSync('.env')) process.loadEnvFile('.env')

export const URL_BANCO_TESTE = process.env.DATABASE_URL_TESTE ?? 'postgresql://vinimon:vinimon@localhost:5432/vinimon_test'

export function garantirBancoDeTeste(url: string): void {
  if (!new URL(url).pathname.endsWith('_test')) throw new Error(`O banco de teste precisa terminar em _test (recebido: ${url})`)
}
```
```ts
// apps/api/vitest.config.ts
import { defineConfig } from 'vitest/config'
import { garantirBancoDeTeste, URL_BANCO_TESTE } from './test/constantes'

garantirBancoDeTeste(URL_BANCO_TESTE)

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'scripts/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: URL_BANCO_TESTE,
      APP_ORIGIN: 'http://localhost:5173',
      TRUST_PROXY: 'false',
      CSRF_SECRET: 'ZGV2LWFwZW5hcy10cm9xdWUtZW0tcHJvZHVjYW8tMDAwMQ==',
      ENCRYPTION_KEY: 'ZGV2LWFwZW5hcy10cm9xdWUtZW0tcHJvZHVjYW8tMDE=',
      UPLOAD_DIR: './storage/teste',
      LOG_LEVEL: 'silent',
      API_DOCS: 'false',
      JOBS_HABILITADOS: 'false',
    },
  },
})
```
```ts
// apps/api/test/global-setup.ts
import { execSync } from 'node:child_process'
import { garantirBancoDeTeste, URL_BANCO_TESTE } from './constantes'

export default function setup() {
  garantirBancoDeTeste(URL_BANCO_TESTE)
  // Só migrações pendentes. NUNCA "migrate reset" (destrutivo e bloqueado para agentes no Prisma 7).
  execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: URL_BANCO_TESTE } })
}
```
```ts
// apps/api/test/setup.ts
import { afterAll } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { garantirBancoDeTeste } from './constantes'

garantirBancoDeTeste(process.env.DATABASE_URL ?? '')

afterAll(async () => {
  await prisma.$disconnect()
})
```
```ts
// apps/api/test/ajudantes.ts
import { CSRF_HEADER, type Perfil } from '@vinimon/shared'
import { env } from '../src/env'
import { Prisma } from '../src/generated/prisma/client'
import { invalidarConfig } from '../src/lib/config'
import { prisma } from '../src/lib/prisma'
import { hashSenha } from '../src/lib/senha'
import { criarSessao, csrfDaSessao, NOME_COOKIE } from '../src/lib/sessao'

export const ORIGEM = env.APP_ORIGIN
export const SENHA_TESTE = 'Cavalo-Bateria-Grampo-2026'
let hashTeste: Promise<string> | undefined
let sequencia = 0

/** Esvazia o schema public (pgboss intocado). Tabelas validadas por regex antes do Prisma.raw. */
export async function limparBanco(): Promise<void> {
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  const nomes = tabelas.map((t) => t.tablename).filter((n) => /^[a-z_][a-z0-9_]*$/.test(n))
  if (nomes.length > 0) {
    const lista = nomes.map((n) => `"public"."${n}"`).join(', ')
    await prisma.$executeRaw`TRUNCATE TABLE ${Prisma.raw(lista)} RESTART IDENTITY CASCADE`
  }
  invalidarConfig()
}

export async function criarArea(dados: { nome?: string; atende?: boolean } = {}) {
  sequencia += 1
  return prisma.area.create({ data: { nome: dados.nome ?? `Área ${sequencia}`, atende: dados.atende ?? true }, select: { id: true } })
}

export async function criarUsuario(d: { perfil: Perfil; areaId?: number | null; ativo?: boolean }) {
  sequencia += 1
  hashTeste ??= hashSenha(SENHA_TESTE) // um hash por execução (argon2 é caro de propósito)
  const areaId = d.areaId !== undefined ? d.areaId : d.perfil === 'OPERADOR' ? (await criarArea()).id : null
  return prisma.usuario.create({
    data: {
      login: `usuario${sequencia}`,
      nome: `Usuário ${sequencia}`,
      email: `usuario${sequencia}@teste.local`,
      senhaHash: await hashTeste,
      perfil: d.perfil,
      areaId,
      ativo: d.ativo ?? true,
    },
    select: { id: true, login: true, perfil: true, areaId: true },
  })
}

/** Cabeçalhos de um usuário com sessão ATIVA (direto no banco, sem passar pelo login/rate limit). */
export async function headersDe(usuarioId: number) {
  const { sessaoId, token } = await criarSessao({ usuarioId, estado: 'ATIVA', ip: '127.0.0.1', userAgent: 'vitest' })
  return { cookie: `${NOME_COOKIE}=${token}`, origin: ORIGEM, [CSRF_HEADER]: csrfDaSessao(sessaoId) }
}
```

### apps/api/src/modules/areas/areas.test.ts
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo áreas', () => {
  let app: App

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
  })

  const corpo = { nome: 'Tecnologia', atende: true, ativo: true, jornadaId: null }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/areas' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({ method: 'GET', url: '/api/v1/areas', headers: await headersDe(u.id) })
      expect(res.statusCode).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('ADMIN cria, lista paginado, audita e recebe 409 em nome duplicado', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const criada = await app.inject({ method: 'POST', url: '/api/v1/areas', headers, payload: { ...corpo, nome: '  Tecnologia  ' } })
    expect(criada.statusCode).toBe(201)
    expect(criada.json()).toMatchObject({ nome: 'Tecnologia', atende: true, ativo: true, jornadaId: null })
    expect(criada.json().criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'area' } })).toBe(1)

    await app.inject({ method: 'POST', url: '/api/v1/areas', headers, payload: { ...corpo, nome: 'Manutenção' } })
    const lista = await app.inject({ method: 'GET', url: '/api/v1/areas?porPagina=1&pagina=2', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 2, pagina: 2, porPagina: 1, itens: [{ nome: 'Tecnologia' }] })

    const duplicada = await app.inject({ method: 'POST', url: '/api/v1/areas', headers, payload: corpo })
    expect(duplicada.statusCode).toBe(409)
    expect(duplicada.json().erro.codigo).toBe('CONFLITO')
    expect(duplicada.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'nome' })])
  })

  it('400 com detalhes por campo e para chave desconhecida', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const curto = await app.inject({ method: 'POST', url: '/api/v1/areas', headers, payload: { ...corpo, nome: 'x' } })
    expect(curto.statusCode).toBe(400)
    expect(curto.json().erro.codigo).toBe('VALIDACAO')
    expect(curto.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nome' })]))
    const extra = await app.inject({ method: 'POST', url: '/api/v1/areas', headers, payload: { ...corpo, perfil: 'ADMIN' } })
    expect(extra.statusCode).toBe(400)
  })

  it('422 REFERENCIA_INVALIDA com jornada inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/areas', headers: await headersDe(admin.id), payload: { ...corpo, jornadaId: 9999 },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().erro.codigo).toBe('REFERENCIA_INVALIDA')
  })

  it('403 ORIGEM_INVALIDA sem Origin e CSRF_INVALIDO sem token', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const { cookie } = await headersDe(admin.id)
    const semOrigem = await app.inject({ method: 'POST', url: '/api/v1/areas', headers: { cookie }, payload: corpo })
    expect(semOrigem.statusCode).toBe(403)
    expect(semOrigem.json().erro.codigo).toBe('ORIGEM_INVALIDA')
    const semToken = await app.inject({ method: 'POST', url: '/api/v1/areas', headers: { cookie, origin: ORIGEM }, payload: corpo })
    expect(semToken.statusCode).toBe(403)
    expect(semToken.json().erro.codigo).toBe('CSRF_INVALIDO')
  })

  it('404 para área inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await app.inject({ method: 'GET', url: '/api/v1/areas/999', headers: await headersDe(admin.id) })
    expect(res.statusCode).toBe(404)
    expect(res.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('409 REGISTRO_EM_USO ao excluir área com usuário', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const area = await criarArea()
    await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/areas/${area.id}`, headers: await headersDe(admin.id) })
    expect(res.statusCode).toBe(409)
    expect(res.json().erro.codigo).toBe('REGISTRO_EM_USO')
  })
})
```

### apps/web/src/lib/api.ts
```ts
import { CSRF_HEADER, type Contrato, type ErroResposta } from '@vinimon/shared'
import type { z } from 'zod'

type Entrada<C extends Contrato> = (C extends { params: infer P extends z.ZodType } ? { params: z.output<P> } : unknown) &
  (C extends { query: infer Q extends z.ZodType } ? { query?: Partial<z.output<Q>> } : unknown) &
  (C extends { body: infer B extends z.ZodType } ? { body: z.input<B> } : unknown)
type EntradaBruta = { params?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown }

let tokenCsrf: string | null = null
let renovarCsrf: (() => Promise<void>) | null = null
/** O token CSRF vive só em memória (S80). */
export const definirCsrf = (token: string | null): void => {
  tokenCsrf = token
}
export const definirRenovadorCsrf = (fn: () => Promise<void>): void => {
  renovarCsrf = fn
}

export class ErroApi extends Error {
  readonly status: number
  readonly codigo: string
  readonly detalhes: { campo: string; mensagem: string }[]
  readonly requestId: string | undefined
  constructor(status: number, corpo: ErroResposta | null, mensagemPadrao = 'Falha de comunicação com o servidor.') {
    super(corpo?.erro.mensagem ?? mensagemPadrao)
    this.name = 'ErroApi'
    this.status = status
    this.codigo = corpo?.erro.codigo ?? (status === 0 ? 'REDE' : 'INTERNO')
    this.detalhes = corpo?.erro.detalhes ?? []
    this.requestId = corpo?.erro.requestId
  }
}

function montarUrl(c: Contrato, params?: Record<string, unknown>, query?: Record<string, unknown>): string {
  let caminho: string = c.caminho
  for (const [k, v] of Object.entries(params ?? {})) caminho = caminho.replace(`:${k}`, encodeURIComponent(String(v)))
  const busca = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) for (const item of v) busca.append(k, String(item))
    else busca.set(k, String(v))
  }
  const qs = busca.toString()
  return `/api/v1${caminho}${qs ? `?${qs}` : ''}`
}

async function requisitar(c: Contrato, e: EntradaBruta, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {}
  if (e.body !== undefined) headers['content-type'] = 'application/json'
  if (c.metodo !== 'GET' && tokenCsrf) headers[CSRF_HEADER] = tokenCsrf
  try {
    return await fetch(montarUrl(c, e.params, e.query), {
      method: c.metodo,
      headers,
      body: e.body === undefined ? undefined : JSON.stringify(e.body),
      credentials: 'same-origin',
      signal,
    })
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'AbortError') throw erro
    throw new ErroApi(0, null, 'Sem conexão com o servidor.')
  }
}

export async function chamar<C extends Contrato>(
  c: C,
  entrada: Entrada<C> & EntradaBruta,
  signal?: AbortSignal,
): Promise<z.output<C['resposta']>> {
  let resposta = await requisitar(c, entrada, signal)
  if (resposta.status === 403 && c.metodo !== 'GET' && renovarCsrf) {
    const corpo = (await resposta.clone().json().catch(() => null)) as ErroResposta | null
    if (corpo?.erro.codigo === 'CSRF_INVALIDO') {
      await renovarCsrf()
      resposta = await requisitar(c, entrada, signal) // repete UMA vez
    }
  }
  if (resposta.status === 204) return undefined as z.output<C['resposta']>
  const json: unknown = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new ErroApi(resposta.status, json as ErroResposta | null)
  return c.resposta.parse(json) as z.output<C['resposta']>
}
// Upload: enviarArquivo(caminho, arquivos, campos, aoProgresso, signal) usa XMLHttpRequest com o mesmo CSRF_HEADER
// e o mesmo tratamento de ErroApi (único outro ponto de I/O HTTP permitido, neste arquivo).
```

### apps/web/src/lib/query-client.ts e features/auth/queries.ts
```ts
// lib/query-client.ts
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ErroApi } from './api'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { silenciarErro?: boolean; erroTitulo?: string }
  }
}

export function criarQueryClient(aoSessaoExpirar: () => void): QueryClient {
  const tratar401 = (e: unknown) => {
    if (e instanceof ErroApi && e.status === 401) aoSessaoExpirar()
  }
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 300_000,
        retry: (n, e) => !(e instanceof ErroApi && e.status >= 400 && e.status < 500) && n < 2,
      },
    },
    queryCache: new QueryCache({ onError: tratar401 }),
    mutationCache: new MutationCache({
      onError: (e, _variaveis, _resultado, mutacao) => {
        tratar401(e)
        if (mutacao.meta?.silenciarErro) return
        toast.error(mutacao.meta?.erroTitulo ?? 'Não foi possível concluir a ação', { description: e.message })
      },
    }),
  })
}
```
```ts
// features/auth/queries.ts
import { queryOptions } from '@tanstack/react-query'
import { authApi } from '@vinimon/shared'
import { chamar, definirCsrf, ErroApi } from '@/lib/api'

export const authChaves = { sessao: ['auth', 'sessao'] as const }

export const authConsultas = {
  sessao: () =>
    queryOptions({
      queryKey: authChaves.sessao,
      queryFn: async ({ signal }) => {
        try {
          const s = await chamar(authApi.sessao, {}, signal)
          definirCsrf(s.csrf)
          return s
        } catch (e) {
          if (e instanceof ErroApi && e.status === 401) {
            definirCsrf(null)
            return null
          }
          throw e
        }
      },
      staleTime: 5 * 60_000,
    }),
}
// Em main.tsx: definirRenovadorCsrf(async () => { await queryClient.fetchQuery({ ...authConsultas.sessao(), staleTime: 0 }) })
```

### apps/web/src/features/areas/queries.ts
```ts
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { areasApi, type CriarArea, type ListarAreasQuery } from '@vinimon/shared'
import { chamar } from '@/lib/api'

export const areaChaves = {
  todas: ['areas'] as const,
  lista: (q: Partial<ListarAreasQuery>) => ['areas', 'lista', q] as const,
}

export const areasConsultas = {
  lista: (q: Partial<ListarAreasQuery>) =>
    queryOptions({ queryKey: areaChaves.lista(q), queryFn: ({ signal }) => chamar(areasApi.listar, { query: q }, signal) }),
}

export function useSalvarArea(id: number | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: CriarArea) =>
      id === null ? chamar(areasApi.criar, { body: dados }) : chamar(areasApi.atualizar, { params: { id }, body: dados }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: areaChaves.todas })
      await qc.invalidateQueries({ queryKey: ['meta'] })
    },
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })
}
```

### apps/web/src/lib/form.ts e components/form/campo-form.tsx
```ts
// lib/form.ts
import { zodResolver } from '@hookform/resolvers/zod'
import { type FieldValues, type Path, type UseFormProps, type UseFormSetError, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { ErroApi } from './api'

export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  opcoes?: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, 'resolver'>,
) {
  return useForm<z.input<S>, unknown, z.output<S>>({ resolver: zodResolver(schema), mode: 'onTouched', ...opcoes })
}

/** 400 com detalhes → erros nos campos; demais → toast. */
export function aplicarErrosDoServidor<T extends FieldValues>(setError: UseFormSetError<T>, erro: unknown): void {
  if (erro instanceof ErroApi && erro.detalhes.length > 0) {
    for (const d of erro.detalhes) setError(d.campo as Path<T>, { type: 'server', message: d.mensagem })
    return
  }
  toast.error(erro instanceof Error ? erro.message : 'Não foi possível concluir a ação. Tente novamente.')
}
```
```tsx
// components/form/campo-form.tsx
import { type ReactNode, useId } from 'react'
import { type Control, Controller, type ControllerRenderProps, type FieldPath, type FieldValues } from 'react-hook-form'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'

export interface ControleAcessivel {
  id: string
  'aria-invalid': boolean
  'aria-describedby': string | undefined
  'aria-required': boolean | undefined
}

export interface CampoFormProps<T extends FieldValues, N extends FieldPath<T>, O> {
  control: Control<T, unknown, O>
  name: N
  rotulo: string
  descricao?: string
  obrigatorio?: boolean
  children: (field: ControllerRenderProps<T, N>, controle: ControleAcessivel) => ReactNode
}

export function CampoForm<T extends FieldValues, N extends FieldPath<T>, O = T>({
  control, name, rotulo, descricao, obrigatorio, children,
}: CampoFormProps<T, N, O>) {
  const id = useId()
  return (
    <Controller<T, N, O>
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const idDescricao = descricao ? `${id}-descricao` : undefined
        const idErro = fieldState.error ? `${id}-erro` : undefined
        const descritoPor = [idDescricao, idErro].filter(Boolean).join(' ') || undefined
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={id}>
              {rotulo}
              {obrigatorio ? <span aria-hidden="true"> *</span> : null}
            </FieldLabel>
            {children(field, { id, 'aria-invalid': fieldState.invalid, 'aria-describedby': descritoPor, 'aria-required': obrigatorio })}
            {descricao ? <FieldDescription id={idDescricao}>{descricao}</FieldDescription> : null}
            {fieldState.error ? <FieldError id={idErro}>{fieldState.error.message}</FieldError> : null}
          </Field>
        )
      }}
    />
  )
}
```

### apps/web/src/routes/_app/admin/areas.tsx (padrão de toda tela de cadastro)
```tsx
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { type Area, CriarAreaSchema } from '@vinimon/shared'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { areasConsultas, useSalvarArea } from '@/features/areas/queries'
import { metaConsultas } from '@/features/meta/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
})

export const Route = createFileRoute('/_app/admin/areas')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(areasConsultas.lista(deps)),
  component: AreasPagina,
})

function AreasPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(areasConsultas.lista({ pagina, busca: search.busca }))
  const [editando, setEditando] = useState<Area | 'nova' | null>(null)
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>Áreas</h1>
        <Button onClick={() => setEditando('nova')}>
          <Plus aria-hidden="true" /> Nova área
        </Button>
      </header>

      <Table aria-label="Áreas">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Atende chamados</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-12"><span className="sr-only">Ações</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((area) => (
            <TableRow key={area.id} className="h-(--row-h)">
              <TableCell>{area.nome}</TableCell>
              <TableCell>{area.atende ? 'Sim' : 'Não'}</TableCell>
              <TableCell><Badge variant={area.ativo ? 'secondary' : 'outline'}>{area.ativo ? 'Ativa' : 'Inativa'}</Badge></TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" aria-label={`Editar ${area.nome}`} onClick={() => setEditando(area)}>
                  <Pencil aria-hidden="true" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <nav aria-label="Paginação" className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>Página {pagina} de {totalPaginas}</span>
        <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => navigate({ search: (s) => ({ ...s, pagina: pagina - 1 }) })}>
          Anterior
        </Button>
        <Button size="sm" variant="outline" disabled={pagina >= totalPaginas} onClick={() => navigate({ search: (s) => ({ ...s, pagina: pagina + 1 }) })}>
          Próxima
        </Button>
      </nav>

      <AreaSheet area={editando} aoFechar={() => setEditando(null)} />
    </section>
  )
}

function AreaSheet({ area, aoFechar }: { area: Area | 'nova' | null; aoFechar: () => void }) {
  const existente = area !== null && area !== 'nova' ? area : null
  const { data: meta } = useSuspenseQuery(metaConsultas.tudo())
  const salvar = useSalvarArea(existente?.id ?? null)
  const form = useZodForm(CriarAreaSchema, {
    values: {
      nome: existente?.nome ?? '',
      atende: existente?.atende ?? true,
      ativo: existente?.ativo ?? true,
      jornadaId: existente?.jornadaId ?? null,
    },
  })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(existente ? 'Área atualizada' : 'Área criada')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={area !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar área' : 'Nova área'}</SheetTitle>
          <SheetDescription>Áreas que atendem recebem chamados na fila.</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
          </CampoForm>
          <CampoForm control={form.control} name="jornadaId" rotulo="Jornada de SLA" descricao="Vazio usa a jornada padrão.">
            {(field, controle) => (
              <Select
                value={field.value === null ? 'padrao' : String(field.value)}
                onValueChange={(v) => field.onChange(v === 'padrao' ? null : Number(v))}
              >
                <SelectTrigger {...controle}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="padrao">Jornada padrão</SelectItem>
                  {meta.jornadas.map((j) => (
                    <SelectItem key={j.id} value={String(j.id)}>{j.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm control={form.control} name="atende" rotulo="Atende chamados">
            {(field, controle) => <Switch id={controle.id} aria-describedby={controle['aria-describedby']} checked={field.value} onCheckedChange={field.onChange} />}
          </CampoForm>
          <CampoForm control={form.control} name="ativo" rotulo="Ativa">
            {(field, controle) => <Switch id={controle.id} aria-describedby={controle['aria-describedby']} checked={field.value} onCheckedChange={field.onChange} />}
          </CampoForm>
          <SheetFooter className="px-0">
            <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" disabled={form.formState.isSubmitting || salvar.isPending}>Salvar</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
```
