import { z } from 'zod'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora } from '../http'
import { zEmail, zNome } from '../limites'
import { EventoEmailParamsSchema } from './modelos-email'

/** Lista de distribuição: e-mails extras que recebem os modelos vinculados (E05). */
export const ListaEmailSchema = z.object({
  id: z.int(),
  nome: z.string(),
  emails: z.array(z.string()),
  criadoEm: zDataHora(),
  atualizadoEm: zDataHora(),
})
export type ListaEmail = z.output<typeof ListaEmailSchema>

const EmailsListaSchema = z
  .array(zEmail())
  .max(100, { error: 'Máximo de 100 e-mails por lista.' })
  .refine((emails) => new Set(emails.map((e) => e.toLowerCase())).size === emails.length, {
    error: 'Há e-mails repetidos na lista.',
  })

export const CriarListaEmailSchema = z.strictObject({
  nome: zNome(),
  emails: EmailsListaSchema,
})
export type CriarListaEmail = z.output<typeof CriarListaEmailSchema>

export const AtualizarListaEmailSchema = z
  .strictObject({
    nome: zNome().optional(),
    emails: EmailsListaSchema.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Informe ao menos um campo.')
export type AtualizarListaEmail = z.output<typeof AtualizarListaEmailSchema>

export const ListarListasEmailQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  direcao: z.enum(['asc', 'desc']).default('asc'),
})
export type ListarListasEmailQuery = z.output<typeof ListarListasEmailQuerySchema>

/** Listas vinculadas a um modelo. Lista vazia remove todas vinculações. Ids repetidos não são aceitos. */
export const VincularListasModeloSchema = z.strictObject({
  listaIds: z
    .array(z.int().positive())
    .max(50, { error: 'Máximo de 50 listas por modelo.' })
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Há listas repetidas.' }),
})
export type VincularListasModelo = z.output<typeof VincularListasModeloSchema>

export const ModeloListasEmailSchema = z.object({
  evento: z.string(),
  listaIds: z.array(z.int()),
})

export const listasEmailApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/listas-email',
    query: ListarListasEmailQuerySchema,
    resposta: paginaDe(ListaEmailSchema),
  }),
  obter: contrato({ metodo: 'GET', caminho: '/listas-email/:id', params: IdParamsSchema, resposta: ListaEmailSchema }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/listas-email',
    body: CriarListaEmailSchema,
    resposta: ListaEmailSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/listas-email/:id',
    params: IdParamsSchema,
    body: AtualizarListaEmailSchema,
    resposta: ListaEmailSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/listas-email/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
  vincularModelo: contrato({
    metodo: 'PUT',
    caminho: '/modelos-email/:evento/listas',
    params: EventoEmailParamsSchema,
    body: VincularListasModeloSchema,
    resposta: ModeloListasEmailSchema,
  }),
}
