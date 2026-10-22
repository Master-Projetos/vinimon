import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora } from '../http'
import { zTag } from '../limites'

export const TagSchema = z.object({
  id: z.int(),
  nome: z.string(),
  ativo: z.boolean(),
  criadoEm: zDataHora(),
})
export type Tag = z.output<typeof TagSchema>

export const CriarTagSchema = z.strictObject({
  nome: zTag(),
  ativo: z.boolean(),
})
export type CriarTag = z.output<typeof CriarTagSchema>

export const AtualizarTagSchema = CriarTagSchema.partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  'Informe ao menos um campo.',
)
export type AtualizarTag = z.output<typeof AtualizarTagSchema>

export const ListarTagsQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
  ordem: z.enum(['nome', 'criadoEm']).default('nome'),
  direcao: z.enum(['asc', 'desc']).default('asc'),
})
export type ListarTagsQuery = z.output<typeof ListarTagsQuerySchema>

export const tagsApi = {
  listar: contrato({ metodo: 'GET', caminho: '/tags', query: ListarTagsQuerySchema, resposta: paginaDe(TagSchema) }),
  obter: contrato({ metodo: 'GET', caminho: '/tags/:id', params: IdParamsSchema, resposta: TagSchema }),
  criar: contrato({ metodo: 'POST', caminho: '/tags', body: CriarTagSchema, resposta: TagSchema, status: 201 }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/tags/:id',
    params: IdParamsSchema,
    body: AtualizarTagSchema,
    resposta: TagSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/tags/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
