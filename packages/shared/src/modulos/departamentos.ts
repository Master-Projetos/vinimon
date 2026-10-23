import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora, zId } from '../http'
import { zNome } from '../limites'

export const DepartamentoUnidadeSchema = z.object({ id: z.int(), nome: z.string() })
export type DepartamentoUnidade = z.output<typeof DepartamentoUnidadeSchema>

export const DepartamentoSchema = z.object({
  id: z.int(),
  unidadeId: z.int(),
  nome: z.string(),
  ativo: z.boolean(),
  unidade: DepartamentoUnidadeSchema,
  criadoEm: zDataHora(),
  atualizadoEm: zDataHora(),
})
export type Departamento = z.output<typeof DepartamentoSchema>

export const CriarDepartamentoSchema = z.strictObject({
  unidadeId: z.int().positive(),
  nome: zNome(),
  ativo: z.boolean(),
})
export type CriarDepartamento = z.output<typeof CriarDepartamentoSchema>

export const AtualizarDepartamentoSchema = CriarDepartamentoSchema.partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  'Informe ao menos um campo.',
)
export type AtualizarDepartamento = z.output<typeof AtualizarDepartamentoSchema>

export const ListarDepartamentosQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
  unidadeId: zId().optional(),
  direcao: z.enum(['asc', 'desc']).default('asc'),
})
export type ListarDepartamentosQuery = z.output<typeof ListarDepartamentosQuerySchema>

export const departamentosApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/departamentos',
    query: ListarDepartamentosQuerySchema,
    resposta: paginaDe(DepartamentoSchema),
  }),
  obter: contrato({
    metodo: 'GET',
    caminho: '/departamentos/:id',
    params: IdParamsSchema,
    resposta: DepartamentoSchema,
  }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/departamentos',
    body: CriarDepartamentoSchema,
    resposta: DepartamentoSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/departamentos/:id',
    params: IdParamsSchema,
    body: AtualizarDepartamentoSchema,
    resposta: DepartamentoSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/departamentos/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
