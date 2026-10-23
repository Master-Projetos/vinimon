import { z } from 'zod'
import { PRESENCAS_MANUAIS } from '../enums'
import { contrato, zDataHora } from '../http'

export const ESTADOS_PRESENCA = ['DISPONIVEL', 'OCUPADO', 'AUSENTE', 'OFFLINE'] as const

/** O estado manual dura no máximo 7 dias (§3.7). */
export const MAX_DIAS_PRESENCA_MANUAL = 7

export const DefinirPresencaSchema = z
  .strictObject({
    estado: z.enum(PRESENCAS_MANUAIS).nullable(),
    ate: z.iso.datetime({ offset: true }).nullable(),
  })
  .superRefine((d, ctx) => {
    if (d.estado === null && d.ate !== null)
      ctx.addIssue({ code: 'custom', path: ['ate'], message: 'Sem estado manual, não há prazo.' })
  })
export type DefinirPresenca = z.output<typeof DefinirPresencaSchema>

export const PresencaPropriaSchema = z.object({
  estado: z.enum(ESTADOS_PRESENCA),
  manual: z.enum(PRESENCAS_MANUAIS).nullable(),
  ate: zDataHora().nullable(),
})
export type PresencaPropria = z.output<typeof PresencaPropriaSchema>

export const presencaApi = {
  definir: contrato({
    metodo: 'PUT',
    caminho: '/me/presenca',
    body: DefinirPresencaSchema,
    resposta: PresencaPropriaSchema,
  }),
}
