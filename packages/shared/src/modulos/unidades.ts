import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora } from '../http'
import { zNome } from '../limites'

export const UnidadeSchema = z.object({
  id: z.int(),
  nome: z.string(),
  endereco: z.string().nullable(),
  ativo: z.boolean(),
  criadoEm: zDataHora(),
  atualizadoEm: zDataHora(),
})
export type Unidade = z.output<typeof UnidadeSchema>

export const CriarUnidadeSchema = z.strictObject({
  nome: zNome(),
  endereco: z.string().max(300).nullable().optional(),
  ativo: z.boolean(),
})
export type CriarUnidade = z.output<typeof CriarUnidadeSchema>

export const AtualizarUnidadeSchema = CriarUnidadeSchema.partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  'Informe ao menos um campo.',
)
export type AtualizarUnidade = z.output<typeof AtualizarUnidadeSchema>

export const ListarUnidadesQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
  direcao: z.enum(['asc', 'desc']).default('asc'),
})
export type ListarUnidadesQuery = z.output<typeof ListarUnidadesQuerySchema>

export const unidadesApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/unidades',
    query: ListarUnidadesQuerySchema,
    resposta: paginaDe(UnidadeSchema),
  }),
  obter: contrato({ metodo: 'GET', caminho: '/unidades/:id', params: IdParamsSchema, resposta: UnidadeSchema }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/unidades',
    body: CriarUnidadeSchema,
    resposta: UnidadeSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/unidades/:id',
    params: IdParamsSchema,
    body: AtualizarUnidadeSchema,
    resposta: UnidadeSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/unidades/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
