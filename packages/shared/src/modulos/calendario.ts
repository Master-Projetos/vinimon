import { z } from 'zod'
import { contrato, zDataHora, zListaIds } from '../http'

export const MAX_DIAS_CALENDARIO = 62
export const MAX_EVENTOS_CALENDARIO = 2000
export const TIPOS_EVENTO_CALENDARIO = ['abertura', 'conclusao', 'agendamento'] as const
export type TipoEventoCalendario = (typeof TIPOS_EVENTO_CALENDARIO)[number]

export const CalendarioQuerySchema = z
  .object({
    de: zDataHora(),
    ate: zDataHora(),
    areaIds: zListaIds(),
    operadorIds: zListaIds(),
  })
  .superRefine((q, ctx) => {
    const dias = (q.ate.getTime() - q.de.getTime()) / 86_400_000
    if (dias < 0) {
      ctx.addIssue({ code: 'custom', path: ['ate'], message: 'A data final precisa ser depois da inicial.' })
    } else if (dias > MAX_DIAS_CALENDARIO) {
      ctx.addIssue({
        code: 'custom',
        path: ['ate'],
        message: `O período pode ter no máximo ${MAX_DIAS_CALENDARIO} dias.`,
      })
    }
  })
export type CalendarioQuery = z.output<typeof CalendarioQuerySchema>

export const EventoCalendarioSchema = z.object({
  tipo: z.enum(TIPOS_EVENTO_CALENDARIO),
  chamadoId: z.int(),
  assunto: z.string(),
  data: zDataHora(),
  /** Responsável do chamado; `cor` é a cor escolhida para ele no calendário (#rrggbb). */
  operador: z.object({ id: z.int(), nome: z.string(), cor: z.string().nullable() }).nullable(),
})
export type EventoCalendario = z.output<typeof EventoCalendarioSchema>

export const calendarioApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/calendario',
    query: CalendarioQuerySchema,
    resposta: z.array(EventoCalendarioSchema),
  }),
}
