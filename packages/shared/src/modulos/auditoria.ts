import { z } from 'zod'
import { ATORES_AUDITORIA } from '../enums'
import { contrato, PaginacaoQuerySchema, paginaDe, zDataHora, zId } from '../http'

export const AuditoriaSchema = z.object({
  id: z.int(),
  criadoEm: zDataHora(),
  atorTipo: z.enum(ATORES_AUDITORIA),
  ator: z.object({ id: z.int(), nome: z.string() }).nullable(),
  acao: z.string(),
  entidade: z.string(),
  entidadeId: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  requestId: z.string().nullable(),
  dados: z.unknown().nullable(),
})
export type Auditoria = z.output<typeof AuditoriaSchema>

/** Consulta da trilha (S89). Sem `de`/`ate`, vale o padrão de 30 dias até agora. Período máximo: 366 dias (S58). */
export const ListarAuditoriaQuerySchema = z.strictObject({
  ...PaginacaoQuerySchema.shape,
  atorId: zId().optional(),
  acao: z.string().trim().min(1).max(60).optional(),
  entidade: z.string().trim().min(1).max(60).optional(),
  entidadeId: z.string().trim().min(1).max(40).optional(),
  de: zDataHora().optional(),
  ate: zDataHora().optional(),
})
export type ListarAuditoriaQuery = z.output<typeof ListarAuditoriaQuerySchema>

export const auditoriaApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/auditoria',
    query: ListarAuditoriaQuerySchema,
    resposta: paginaDe(AuditoriaSchema),
  }),
}
