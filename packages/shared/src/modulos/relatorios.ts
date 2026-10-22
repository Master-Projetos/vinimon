import { z } from 'zod'
import { contrato, zId } from '../http'

export const TIPOS_RELATORIO = [
  'visao-geral',
  'por-status',
  'por-area',
  'por-problema',
  'por-operador',
  'por-solicitante',
  'sla',
  'avaliacoes',
] as const
export type TipoRelatorio = (typeof TIPOS_RELATORIO)[number]

export const MAX_DIAS_RELATORIO = 366

const zDia = () => z.iso.date({ error: 'Use a data no formato AAAA-MM-DD.' })

export const RelatorioParamsSchema = z.object({ tipo: z.enum(TIPOS_RELATORIO) })
export type RelatorioParams = z.output<typeof RelatorioParamsSchema>

export const RelatorioQuerySchema = z
  .object({
    de: zDia().optional(),
    ate: zDia().optional(),
    areaId: zId().optional(),
    operadorId: zId().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.de === undefined || q.ate === undefined) return
    const dias = (Date.parse(q.ate) - Date.parse(q.de)) / 86_400_000
    if (dias < 0)
      ctx.addIssue({ code: 'custom', path: ['ate'], message: 'A data final precisa ser depois da inicial.' })
    else if (dias > MAX_DIAS_RELATORIO)
      ctx.addIssue({
        code: 'custom',
        path: ['ate'],
        message: `O período pode ter no máximo ${MAX_DIAS_RELATORIO} dias.`,
      })
  })
export type RelatorioQuery = z.output<typeof RelatorioQuerySchema>

export const IndicadoresSchema = z.object({
  total: z.int(),
  encerrados: z.int(),
  /** % de encerrados dentro do prazo de solução (só os que têm meta); null sem base de cálculo. */
  pctNoPrazo: z.number().nullable(),
  tempoMedioSolucaoUtilMin: z.int().nullable(),
})
export type Indicadores = z.output<typeof IndicadoresSchema>

export const LinhaRelatorioSchema = IndicadoresSchema.extend({
  chave: z.string(),
  nome: z.string(),
})
export type LinhaRelatorio = z.output<typeof LinhaRelatorioSchema>

export const RelatorioSchema = z.object({
  tipo: z.enum(TIPOS_RELATORIO),
  de: z.string(),
  ate: z.string(),
  totais: IndicadoresSchema,
  linhas: z.array(LinhaRelatorioSchema),
})
export type Relatorio = z.output<typeof RelatorioSchema>

export const relatoriosApi = {
  obter: contrato({
    metodo: 'GET',
    caminho: '/relatorios/:tipo',
    params: RelatorioParamsSchema,
    query: RelatorioQuerySchema,
    resposta: RelatorioSchema,
  }),
}
