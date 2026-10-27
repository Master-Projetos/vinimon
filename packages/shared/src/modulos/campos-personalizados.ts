import { z } from 'zod'
import { compilarRegexCampo, REGEX_CHAVE_CAMPO } from '../campos'
import { TIPOS_CAMPO, VISIBILIDADES_CAMPO } from '../enums'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zId } from '../http'

export const VinculoCampoProblemaSchema = z.strictObject({
  problemaId: z.int().positive(),
  obrigatorio: z.boolean().nullable(),
})
export type VinculoCampoProblema = z.output<typeof VinculoCampoProblemaSchema>

export const CampoPersonalizadoSchema = z.object({
  id: z.int(),
  chave: z.string(),
  rotulo: z.string(),
  tipo: z.enum(TIPOS_CAMPO),
  opcoes: z.array(z.string()),
  obrigatorio: z.boolean(),
  regex: z.string().nullable(),
  ajuda: z.string().nullable(),
  visibilidade: z.enum(VISIBILIDADES_CAMPO),
  ordem: z.int(),
  ativo: z.boolean(),
  problemas: z.array(VinculoCampoProblemaSchema),
})
export type CampoPersonalizado = z.output<typeof CampoPersonalizadoSchema>

const CorpoCampoBase = z.strictObject({
  chave: z.string().regex(REGEX_CHAVE_CAMPO, 'Use minúsculas, dígitos e _, começando por letra (2 a 60 caracteres).'),
  rotulo: z.string().trim().min(1, 'Informe o rótulo.').max(120, 'Use no máximo 120 caracteres.'),
  tipo: z.enum(TIPOS_CAMPO),
  opcoes: z.array(z.string().trim().min(1).max(100)).max(50),
  obrigatorio: z.boolean(),
  regex: z.string().min(1).max(100).nullable(),
  ajuda: z.string().trim().min(1).max(300).nullable(),
  visibilidade: z.enum(VISIBILIDADES_CAMPO),
  ordem: z.int().min(0).max(10_000),
  ativo: z.boolean(),
  problemas: z.array(VinculoCampoProblemaSchema).max(500),
})

type CorpoParcial = Partial<z.output<typeof CorpoCampoBase>>

/** Regras que dependem de mais de um campo (valem na criação e na atualização, se os campos vierem). */
function validarCampo(d: CorpoParcial, ctx: z.RefinementCtx): void {
  const seleciona = d.tipo === 'SELECAO' || d.tipo === 'SELECAO_MULTIPLA'
  if (d.opcoes !== undefined && d.tipo !== undefined) {
    if (seleciona && d.opcoes.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['opcoes'], message: 'Informe ao menos uma opção.' })
    }
    if (!seleciona && d.opcoes.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['opcoes'], message: 'Opções só valem para seleção.' })
    }
  }
  if (d.opcoes !== undefined && new Set(d.opcoes).size !== d.opcoes.length) {
    ctx.addIssue({ code: 'custom', path: ['opcoes'], message: 'Há opções repetidas.' })
  }
  if (d.regex != null) {
    if (compilarRegexCampo(d.regex) === null) {
      ctx.addIssue({ code: 'custom', path: ['regex'], message: 'Expressão regular inválida.' })
    }
    if (d.tipo !== undefined && d.tipo !== 'TEXTO' && d.tipo !== 'AREA_TEXTO') {
      ctx.addIssue({ code: 'custom', path: ['regex'], message: 'Regex só vale para texto.' })
    }
  }
  if (d.problemas !== undefined) {
    const ids = d.problemas.map((p) => p.problemaId)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['problemas'], message: 'Há problemas repetidos.' })
    }
  }
}

export const CriarCampoPersonalizadoSchema = CorpoCampoBase.superRefine(validarCampo)
export type CriarCampoPersonalizado = z.output<typeof CriarCampoPersonalizadoSchema>

/** A chave é imutável (identifica os valores já gravados). */
export const AtualizarCampoPersonalizadoSchema = CorpoCampoBase.omit({ chave: true })
  .partial()
  .superRefine(validarCampo)
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Informe ao menos um campo.')
export type AtualizarCampoPersonalizado = z.output<typeof AtualizarCampoPersonalizadoSchema>

export const ListarCamposPersonalizadosQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
})
export type ListarCamposPersonalizadosQuery = z.output<typeof ListarCamposPersonalizadosQuerySchema>

export const AplicaveisQuerySchema = z.object({ problemaId: zId().optional() })
export type AplicaveisQuery = z.output<typeof AplicaveisQuerySchema>

/** Campo como o formulário o recebe: `obrigatorio` já considera o vínculo com o problema. */
export const CampoAplicavelSchema = CampoPersonalizadoSchema.omit({ problemas: true })
export type CampoAplicavel = z.output<typeof CampoAplicavelSchema>

export const camposPersonalizadosApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/campos-personalizados',
    query: ListarCamposPersonalizadosQuerySchema,
    resposta: paginaDe(CampoPersonalizadoSchema),
  }),
  aplicaveis: contrato({
    metodo: 'GET',
    caminho: '/campos-personalizados/aplicaveis',
    query: AplicaveisQuerySchema,
    resposta: z.array(CampoAplicavelSchema),
  }),
  obter: contrato({
    metodo: 'GET',
    caminho: '/campos-personalizados/:id',
    params: IdParamsSchema,
    resposta: CampoPersonalizadoSchema,
  }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/campos-personalizados',
    body: CriarCampoPersonalizadoSchema,
    resposta: CampoPersonalizadoSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/campos-personalizados/:id',
    params: IdParamsSchema,
    body: AtualizarCampoPersonalizadoSchema,
    resposta: CampoPersonalizadoSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/campos-personalizados/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
