import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe } from '../http'

export const TipoAtivoSchema = z.object({
  id: z.int(),
  nome: z.string(),
  ativo: z.boolean(),
})
export type TipoAtivo = z.output<typeof TipoAtivoSchema>

export const CriarTipoAtivoSchema = z.strictObject({
  nome: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(80, 'Use no máximo 80 caracteres.'),
  ativo: z.boolean(),
})
export type CriarTipoAtivo = z.output<typeof CriarTipoAtivoSchema>

export const AtualizarTipoAtivoSchema = CriarTipoAtivoSchema.partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  'Informe ao menos um campo.',
)
export type AtualizarTipoAtivo = z.output<typeof AtualizarTipoAtivoSchema>

export const ListarTiposAtivoQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
  direcao: z.enum(['asc', 'desc']).default('asc'),
})
export type ListarTiposAtivoQuery = z.output<typeof ListarTiposAtivoQuerySchema>

export const tiposAtivoApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/tipos-ativo',
    query: ListarTiposAtivoQuerySchema,
    resposta: paginaDe(TipoAtivoSchema),
  }),
  obter: contrato({ metodo: 'GET', caminho: '/tipos-ativo/:id', params: IdParamsSchema, resposta: TipoAtivoSchema }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/tipos-ativo',
    body: CriarTipoAtivoSchema,
    resposta: TipoAtivoSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/tipos-ativo/:id',
    params: IdParamsSchema,
    body: AtualizarTipoAtivoSchema,
    resposta: TipoAtivoSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/tipos-ativo/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
