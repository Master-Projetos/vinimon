import { z } from 'zod'
import { contrato, IdParamsSchema, UuidParamsSchema, zDataHora } from '../http'

/** Limites de S63 (por chamado). */
export const MAX_ANEXOS_POR_CHAMADO = 50
export const MAX_BYTES_POR_CHAMADO = 100 * 1024 * 1024

export const AnexoSchema = z.object({
  id: z.uuid(),
  chamadoId: z.int(),
  assentamentoId: z.int().nullable(),
  /** Só para exibição (S68): nunca usado como caminho. */
  nomeOriginal: z.string(),
  mime: z.string(),
  tamanho: z.int(),
  interno: z.boolean(),
  enviadoPor: z.object({ id: z.int(), nome: z.string() }),
  criadoEm: zDataHora(),
})
export type Anexo = z.output<typeof AnexoSchema>

/** Campos do multipart (texto), que precisam vir antes dos arquivos. */
export const CamposUploadSchema = z.strictObject({
  interno: z.enum(['true', 'false']).default('false'),
  assentamentoId: z.coerce.number().int().positive().max(2_147_483_647).optional(),
})
export type CamposUpload = z.output<typeof CamposUploadSchema>

export const anexosApi = {
  enviar: contrato({
    metodo: 'POST',
    caminho: '/chamados/:id/anexos',
    params: IdParamsSchema,
    resposta: z.array(AnexoSchema),
    status: 201,
  }),
  listar: contrato({
    metodo: 'GET',
    caminho: '/chamados/:id/anexos',
    params: IdParamsSchema,
    resposta: z.array(AnexoSchema),
  }),
  baixar: contrato({ metodo: 'GET', caminho: '/anexos/:id', params: UuidParamsSchema, resposta: z.string() }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/anexos/:id',
    params: UuidParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
