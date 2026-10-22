import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora } from '../http'

/** Data 'yyyy-MM-dd'. Feriado recorrente volta com o ano 2000 (só mês e dia contam). */
const DataFeriadoSchema = z.iso.date({ error: 'Use a data no formato AAAA-MM-DD.' })

export const FeriadoSchema = z.object({
  id: z.int(),
  data: DataFeriadoSchema,
  nome: z.string(),
  recorrente: z.boolean(),
  jornadaId: z.int().nullable(),
  criadoEm: zDataHora(),
})
export type Feriado = z.output<typeof FeriadoSchema>

export const CriarFeriadoSchema = z.strictObject({
  data: DataFeriadoSchema,
  nome: z.string().trim().min(1, 'Informe o nome do feriado.').max(120, 'Use no máximo 120 caracteres.'),
  recorrente: z.boolean(),
  jornadaId: z.int().positive().nullable(),
})
export type CriarFeriado = z.output<typeof CriarFeriadoSchema>

/** Edição troca o feriado inteiro: todos os campos são obrigatórios. */
export const AtualizarFeriadoSchema = CriarFeriadoSchema
export type AtualizarFeriado = z.output<typeof AtualizarFeriadoSchema>

export const ListarFeriadosQuerySchema = PaginacaoQuerySchema.extend({
  /** Recorrentes entram sempre; os demais filtram pelo ano da data. */
  ano: z.coerce.number().int().min(1900).max(2999).optional(),
})
export type ListarFeriadosQuery = z.output<typeof ListarFeriadosQuerySchema>

export const feriadosApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/feriados',
    query: ListarFeriadosQuerySchema,
    resposta: paginaDe(FeriadoSchema),
  }),
  obter: contrato({ metodo: 'GET', caminho: '/feriados/:id', params: IdParamsSchema, resposta: FeriadoSchema }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/feriados',
    body: CriarFeriadoSchema,
    resposta: FeriadoSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PUT',
    caminho: '/feriados/:id',
    params: IdParamsSchema,
    body: AtualizarFeriadoSchema,
    resposta: FeriadoSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/feriados/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
