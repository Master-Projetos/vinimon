import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zId } from '../http'

export const ProblemaAreaSchema = z.object({ id: z.int(), nome: z.string() })
export type ProblemaArea = z.output<typeof ProblemaAreaSchema>

export const ProblemaSchema = z.object({
  id: z.int(),
  nome: z.string(),
  descricao: z.string().nullable(),
  areaPadraoId: z.int().nullable(),
  slaRespostaMin: z.int().nullable(),
  slaSolucaoMin: z.int().nullable(),
  ativo: z.boolean(),
  categoria1Id: z.int().nullable(),
  categoria2Id: z.int().nullable(),
  categoria3Id: z.int().nullable(),
  areas: z.array(ProblemaAreaSchema),
})
export type Problema = z.output<typeof ProblemaSchema>

const camposProblema = z.strictObject({
  nome: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(120, 'Use no máximo 120 caracteres.'),
  descricao: z.string().trim().max(500, 'Use no máximo 500 caracteres.').optional(),
  areaIds: z
    .array(zId())
    .min(1, 'Informe ao menos uma área.')
    .max(20, 'Use no máximo 20 áreas.')
    .refine((ids) => new Set(ids).size === ids.length, 'Não repita áreas.'),
  areaPadraoId: zId(),
  slaRespostaMin: z.int().positive('Use um valor positivo.').nullable(),
  slaSolucaoMin: z.int().positive('Use um valor positivo.').nullable(),
  ativo: z.boolean(),
  /** Categoria N precisa ser do grupo N; omitido mantém (atualização) ou fica sem categoria (criação). */
  categoria1Id: zId().nullable().optional(),
  categoria2Id: zId().nullable().optional(),
  categoria3Id: zId().nullable().optional(),
})

const padraoEstaNaLista = {
  error: 'A área padrão precisa estar entre as áreas do problema.',
  path: ['areaPadraoId'],
}

export const CriarProblemaSchema = camposProblema.refine((d) => d.areaIds.includes(d.areaPadraoId), padraoEstaNaLista)
export type CriarProblema = z.output<typeof CriarProblemaSchema>

/** Parcial: a regra área padrão ∈ áreas só vale quando os dois campos chegam juntos; o service confere o resto. */
export const AtualizarProblemaSchema = camposProblema
  .partial()
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Informe ao menos um campo.')
  .refine(
    (d) => d.areaIds === undefined || d.areaPadraoId === undefined || d.areaIds.includes(d.areaPadraoId),
    padraoEstaNaLista,
  )
export type AtualizarProblema = z.output<typeof AtualizarProblemaSchema>

export const ListarProblemasQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
  direcao: z.enum(['asc', 'desc']).default('asc'),
})
export type ListarProblemasQuery = z.output<typeof ListarProblemasQuerySchema>

export const problemasApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/problemas',
    query: ListarProblemasQuerySchema,
    resposta: paginaDe(ProblemaSchema),
  }),
  obter: contrato({ metodo: 'GET', caminho: '/problemas/:id', params: IdParamsSchema, resposta: ProblemaSchema }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/problemas',
    body: CriarProblemaSchema,
    resposta: ProblemaSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/problemas/:id',
    params: IdParamsSchema,
    body: AtualizarProblemaSchema,
    resposta: ProblemaSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/problemas/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
