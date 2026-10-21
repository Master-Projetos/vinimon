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
  'VALIDACAO',
  'REQUISICAO_INVALIDA',
  'NAO_AUTENTICADO',
  'MFA_PENDENTE',
  'TROCA_SENHA_OBRIGATORIA',
  'SEM_PERMISSAO',
  'ORIGEM_INVALIDA',
  'CSRF_INVALIDO',
  'NAO_ENCONTRADO',
  'ROTA_INEXISTENTE',
  'CONFLITO',
  'REGISTRO_EM_USO',
  'REFERENCIA_INVALIDA',
  'REGRA_NEGOCIO',
  'ARQUIVO_GRANDE',
  'TIPO_ARQUIVO_INVALIDO',
  'CONTEUDO_NAO_SUPORTADO',
  'MUITAS_TENTATIVAS',
  'INDISPONIVEL',
  'INTERNO',
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
