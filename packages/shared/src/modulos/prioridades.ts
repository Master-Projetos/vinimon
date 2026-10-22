import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe } from '../http'
import { zCor } from '../limites'

export const PrioridadeSchema = z.object({
  id: z.int(),
  nome: z.string(),
  cor: z.string(),
  ordem: z.int(),
  padrao: z.boolean(),
  slaRespostaMin: z.int().nullable(),
  slaSolucaoMin: z.int().nullable(),
  ativo: z.boolean(),
})
export type Prioridade = z.output<typeof PrioridadeSchema>

export const CriarPrioridadeSchema = z.strictObject({
  nome: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(60, 'Use no máximo 60 caracteres.'),
  cor: zCor(),
  ordem: z.int().min(0, 'Use um valor entre 0 e 1000.').max(1000, 'Use um valor entre 0 e 1000.'),
  padrao: z.boolean(),
  slaRespostaMin: z.int().positive('Use um número maior que zero.').nullable(),
  slaSolucaoMin: z.int().positive('Use um número maior que zero.').nullable(),
  ativo: z.boolean(),
})
export type CriarPrioridade = z.output<typeof CriarPrioridadeSchema>

export const AtualizarPrioridadeSchema = CriarPrioridadeSchema.partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  'Informe ao menos um campo.',
)
export type AtualizarPrioridade = z.output<typeof AtualizarPrioridadeSchema>

export const ListarPrioridadesQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
})
export type ListarPrioridadesQuery = z.output<typeof ListarPrioridadesQuerySchema>

export const prioridadesApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/prioridades',
    query: ListarPrioridadesQuerySchema,
    resposta: paginaDe(PrioridadeSchema),
  }),
  obter: contrato({ metodo: 'GET', caminho: '/prioridades/:id', params: IdParamsSchema, resposta: PrioridadeSchema }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/prioridades',
    body: CriarPrioridadeSchema,
    resposta: PrioridadeSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/prioridades/:id',
    params: IdParamsSchema,
    body: AtualizarPrioridadeSchema,
    resposta: PrioridadeSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/prioridades/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
