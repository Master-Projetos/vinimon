import { z } from 'zod'
import { SITUACOES_ARTIGO, VISIBILIDADES_ARTIGO } from '../enums'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora, zId } from '../http'

export const ArtigoResumoSchema = z.object({
  id: z.int(),
  titulo: z.string(),
  resumo: z.string().nullable(),
  categoriaId: z.int().nullable(),
  situacao: z.enum(SITUACOES_ARTIGO),
  visibilidade: z.enum(VISIBILIDADES_ARTIGO),
  visualizacoes: z.int(),
  publicadoEm: zDataHora().nullable(),
  atualizadoEm: zDataHora(),
})
export type ArtigoResumo = z.output<typeof ArtigoResumoSchema>

export const ArtigoSchema = ArtigoResumoSchema.extend({
  conteudo: z.string(),
  autorId: z.int().nullable(),
  problemaIds: z.array(z.int()),
  votosUteis: z.int(),
  votosNaoUteis: z.int(),
})
export type Artigo = z.output<typeof ArtigoSchema>

export const SugestaoArtigoSchema = z.object({
  id: z.int(),
  titulo: z.string(),
  resumo: z.string().nullable(),
})
export type SugestaoArtigo = z.output<typeof SugestaoArtigoSchema>

export const CriarArtigoSchema = z.strictObject({
  titulo: z.string().trim().min(3, 'Informe ao menos 3 caracteres.').max(200, 'Use no máximo 200 caracteres.'),
  resumo: z.string().trim().max(500, 'Use no máximo 500 caracteres.').nullable().default(null),
  conteudo: z.string().min(1, 'Informe o conteúdo.').max(200_000, 'Use no máximo 200.000 caracteres.'),
  categoriaId: zId().nullable().default(null),
  situacao: z.enum(SITUACOES_ARTIGO).default('RASCUNHO'),
  visibilidade: z.enum(VISIBILIDADES_ARTIGO).default('PUBLICO'),
  problemaIds: z.array(zId()).max(50, 'Use no máximo 50 problemas.').default([]),
})
export type CriarArtigo = z.output<typeof CriarArtigoSchema>

export const AtualizarArtigoSchema = z
  .strictObject({
    titulo: CriarArtigoSchema.shape.titulo,
    resumo: z.string().trim().max(500, 'Use no máximo 500 caracteres.').nullable(),
    conteudo: CriarArtigoSchema.shape.conteudo,
    categoriaId: zId().nullable(),
    situacao: z.enum(SITUACOES_ARTIGO),
    visibilidade: z.enum(VISIBILIDADES_ARTIGO),
    problemaIds: z.array(zId()).max(50, 'Use no máximo 50 problemas.'),
  })
  .partial()
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Informe ao menos um campo.')
export type AtualizarArtigo = z.output<typeof AtualizarArtigoSchema>

export const ListarArtigosQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  categoriaId: zId().optional(),
  problemaId: zId().optional(),
})
export type ListarArtigosQuery = z.output<typeof ListarArtigosQuerySchema>

export const SugestoesArtigosQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  problemaId: zId().optional(),
})
export type SugestoesArtigosQuery = z.output<typeof SugestoesArtigosQuerySchema>

export const VotoArtigoSchema = z.strictObject({ util: z.boolean() })
export type VotoArtigo = z.output<typeof VotoArtigoSchema>

export const artigosApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/artigos',
    query: ListarArtigosQuerySchema,
    resposta: paginaDe(ArtigoResumoSchema),
  }),
  sugestoes: contrato({
    metodo: 'GET',
    caminho: '/artigos/sugestoes',
    query: SugestoesArtigosQuerySchema,
    resposta: z.array(SugestaoArtigoSchema),
  }),
  obter: contrato({ metodo: 'GET', caminho: '/artigos/:id', params: IdParamsSchema, resposta: ArtigoSchema }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/artigos',
    body: CriarArtigoSchema,
    resposta: ArtigoSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/artigos/:id',
    params: IdParamsSchema,
    body: AtualizarArtigoSchema,
    resposta: ArtigoSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/artigos/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
  votar: contrato({
    metodo: 'POST',
    caminho: '/artigos/:id/voto',
    params: IdParamsSchema,
    body: VotoArtigoSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
