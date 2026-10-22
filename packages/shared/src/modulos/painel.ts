import { z } from 'zod'
import { NOTAS_AVALIACAO } from '../enums'
import { contrato, zDataHora, zId } from '../http'

export const PERIODOS_PAINEL = [7, 30, 90] as const
export const MODOS_AREA_PAINEL = ['destino', 'origem'] as const

export const PainelQuerySchema = z.object({
  periodo: z.coerce
    .number()
    .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
    .default(30),
  areaId: zId().optional(),
  modoArea: z.enum(MODOS_AREA_PAINEL).default('destino'),
})
export type PainelQuery = z.output<typeof PainelQuerySchema>

export const PainelKpisSchema = z.object({
  abertos: z.int(),
  filaSemResponsavel: z.int(),
  minhaFila: z.int(),
  abertosHoje: z.int(),
  concluidosHoje: z.int(),
  slaVencido: z.int(),
  slaEmRisco: z.int(),
  aguardandoValidacao: z.int(),
})
export type PainelKpis = z.output<typeof PainelKpisSchema>

const ItemContagemSchema = z.object({ id: z.int(), nome: z.string(), total: z.int() })

export const PainelSchema = z.object({
  /** USUARIO recebe a versão reduzida: só os próprios chamados e sem a distribuição por área. */
  reduzido: z.boolean(),
  periodo: z.int(),
  kpis: PainelKpisSchema,
  /** Quatro meses, do mais antigo ao atual, no fuso `sistema.fusoHorario`. */
  abertosEncerradosPorMes: z.array(z.object({ mes: z.string(), abertos: z.int(), encerrados: z.int() })),
  /** Chamados em aberto abertos dentro do período. */
  porStatus: z.array(ItemContagemSchema),
  porPrioridade: z.array(ItemContagemSchema),
  porArea: z.array(ItemContagemSchema),
  avaliacoesDoMes: z.array(z.object({ nota: z.enum(NOTAS_AVALIACAO), total: z.int() })),
  slaProximo: z.array(
    z.object({
      id: z.int(),
      assunto: z.string(),
      status: z.string(),
      area: z.string(),
      prazoSolucaoEm: zDataHora(),
    }),
  ),
})
export type Painel = z.output<typeof PainelSchema>

export const painelApi = {
  obter: contrato({ metodo: 'GET', caminho: '/painel', query: PainelQuerySchema, resposta: PainelSchema }),
}
