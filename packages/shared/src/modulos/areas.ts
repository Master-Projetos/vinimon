import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora } from '../http'

export const AreaDestinoSchema = z.strictObject({ areaId: z.int().positive(), padrao: z.boolean() })
export type AreaDestino = z.output<typeof AreaDestinoSchema>

/** No máximo uma destino padrão e nenhuma área repetida (A05). */
export const DestinosSchema = z
  .array(AreaDestinoSchema)
  .max(200)
  .superRefine((destinos, ctx) => {
    if (new Set(destinos.map((d) => d.areaId)).size !== destinos.length) {
      ctx.addIssue({ code: 'custom', message: 'Há áreas repetidas nos destinos.' })
    }
    if (destinos.filter((d) => d.padrao).length > 1) {
      ctx.addIssue({ code: 'custom', message: 'Só um destino pode ser o padrão.' })
    }
  })

export const AreaSchema = z.object({
  id: z.int(),
  nome: z.string(),
  atende: z.boolean(),
  ativo: z.boolean(),
  /** Sem o módulo, o OPERADOR que só tem áreas assim não acessa o inventário (A17). */
  moduloInventario: z.boolean().default(true),
  jornadaId: z.int().nullable(),
  /** Vazio = quem é desta área pode abrir chamado para qualquer área. */
  destinos: z.array(AreaDestinoSchema).default([]),
  criadoEm: zDataHora(),
  atualizadoEm: zDataHora(),
})
export type Area = z.output<typeof AreaSchema>

export const CriarAreaSchema = z.strictObject({
  nome: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(120, 'Use no máximo 120 caracteres.'),
  atende: z.boolean(),
  ativo: z.boolean(),
  /** Omitido: na criação vale `true`; na atualização, mantém o atual. */
  moduloInventario: z.boolean().optional(),
  jornadaId: z.int().positive().nullable(),
  /** Omitido: na criação, sem destinos; na atualização, mantém os atuais. */
  destinos: DestinosSchema.optional(),
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
