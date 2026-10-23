import { z } from 'zod'
import { TIPOS_ASSENTAMENTO, TIPOS_EVENTO } from '../enums'
import { CursorQuerySchema, contrato, cursorDe, IdParamsSchema, zDataHora } from '../http'
import { zComentario } from '../limites'
import { extrairMencoes } from '../mencoes'

export const MAX_MENCOES = 20

export const AssentamentoSchema = z.object({
  id: z.int(),
  chamadoId: z.int(),
  tipo: z.enum(TIPOS_ASSENTAMENTO),
  interno: z.boolean(),
  texto: z.string(),
  evento: z.enum(TIPOS_EVENTO).nullable(),
  dados: z.record(z.string(), z.unknown()).nullable(),
  autor: z.object({ id: z.int(), nome: z.string() }).nullable(),
  criadoEm: zDataHora(),
  clienteId: z.uuid().nullable(),
})
export type Assentamento = z.output<typeof AssentamentoSchema>

export const ComentarChamadoSchema = z
  .strictObject({
    texto: zComentario(),
    interno: z.boolean(),
    clienteId: z.uuid(),
  })
  .superRefine((d, ctx) => {
    if (extrairMencoes(d.texto).length > MAX_MENCOES)
      ctx.addIssue({ code: 'custom', path: ['texto'], message: `Use no máximo ${MAX_MENCOES} menções.` })
  })
export type ComentarChamado = z.output<typeof ComentarChamadoSchema>

export const ComentarRespostaSchema = z.object({
  assentamento: AssentamentoSchema,
  /** Menções que não valem (inativo, sem acesso ao chamado ou, em interno, sem acesso ao interno). */
  mencoesIgnoradas: z.array(z.object({ id: z.int(), nome: z.string() })),
})
export type ComentarResposta = z.output<typeof ComentarRespostaSchema>

export const assentamentosApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/chamados/:id/assentamentos',
    params: IdParamsSchema,
    query: CursorQuerySchema,
    resposta: cursorDe(AssentamentoSchema),
  }),
  comentar: contrato({
    metodo: 'POST',
    caminho: '/chamados/:id/assentamentos',
    params: IdParamsSchema,
    body: ComentarChamadoSchema,
    resposta: ComentarRespostaSchema,
    status: 201,
  }),
}
