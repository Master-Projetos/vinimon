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
    metodo: 'PATCH',
    caminho: '/areas/:id',
    params: IdParamsSchema,
    body: AtualizarAreaSchema,
    resposta: AreaSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/areas/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
