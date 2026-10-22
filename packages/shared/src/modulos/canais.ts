import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe } from '../http'

export const CanalSchema = z.object({
  id: z.int(),
  nome: z.string(),
  sistema: z.boolean(),
  ativo: z.boolean(),
})
export type Canal = z.output<typeof CanalSchema>

export const CriarCanalSchema = z.strictObject({
  nome: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(60, 'Use no máximo 60 caracteres.'),
  ativo: z.boolean(),
})
export type CriarCanal = z.output<typeof CriarCanalSchema>

export const AtualizarCanalSchema = CriarCanalSchema.partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  'Informe ao menos um campo.',
)
export type AtualizarCanal = z.output<typeof AtualizarCanalSchema>

export const ListarCanaisQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
  direcao: z.enum(['asc', 'desc']).default('asc'),
})
export type ListarCanaisQuery = z.output<typeof ListarCanaisQuerySchema>

export const canaisApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/canais',
    query: ListarCanaisQuerySchema,
    resposta: paginaDe(CanalSchema),
  }),
  obter: contrato({ metodo: 'GET', caminho: '/canais/:id', params: IdParamsSchema, resposta: CanalSchema }),
  criar: contrato({ metodo: 'POST', caminho: '/canais', body: CriarCanalSchema, resposta: CanalSchema, status: 201 }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/canais/:id',
    params: IdParamsSchema,
    body: AtualizarCanalSchema,
    resposta: CanalSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/canais/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
