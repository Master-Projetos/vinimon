import { z } from 'zod'
import { SITUACOES_ATIVO } from '../enums'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora, zId } from '../http'

const zEtiqueta = () =>
  z
    .string()
    .trim()
    .min(1, { error: 'Informe a etiqueta.' })
    .max(60, { error: 'Máximo de 60 caracteres.' })
    .regex(/^[A-Za-z0-9._/-]+$/, { error: 'Use só letras, números, ponto, barra, hífen e sublinhado.' })
const zTextoOpc = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Máximo de ${max} caracteres.` })
    .nullable()
    .optional()

export const AtivoBuscaSchema = z.object({ id: z.int(), etiqueta: z.string(), tipo: z.string() })
export type AtivoBusca = z.output<typeof AtivoBuscaSchema>

export const AtivoSchema = z.object({
  id: z.int(),
  etiqueta: z.string(),
  tipoId: z.int(),
  tipo: z.string(),
  modelo: z.string().nullable(),
  serie: z.string().nullable(),
  departamentoId: z.int().nullable(),
  departamento: z.string().nullable(),
  responsavelId: z.int().nullable(),
  responsavelTexto: z.string().nullable(),
  situacao: z.enum(SITUACOES_ATIVO),
  observacao: z.string().nullable(),
  qtdChamados: z.int(),
  criadoEm: zDataHora(),
  atualizadoEm: zDataHora(),
})
export type Ativo = z.output<typeof AtivoSchema>

export const AtivoChamadoSchema = z.object({
  id: z.int(),
  assunto: z.string(),
  statusId: z.int(),
  abertoEm: zDataHora(),
})
export type AtivoChamado = z.output<typeof AtivoChamadoSchema>

export const BuscarAtivosQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(3, { error: 'Digite ao menos 3 caracteres.' })
    .max(100, { error: 'Máximo de 100 caracteres.' }),
})
export type BuscarAtivosQuery = z.output<typeof BuscarAtivosQuerySchema>

export const ListarAtivosQuerySchema = PaginacaoQuerySchema.extend({
  tipoId: zId().optional(),
  situacao: z.enum(SITUACOES_ATIVO).optional(),
  departamentoId: zId().optional(),
  busca: z.string().trim().max(100).optional(),
})
export type ListarAtivosQuery = z.output<typeof ListarAtivosQuerySchema>

export const CriarAtivoSchema = z.strictObject({
  etiqueta: zEtiqueta(),
  tipoId: zId(),
  modelo: zTextoOpc(120),
  serie: zTextoOpc(100),
  departamentoId: zId().nullable().optional(),
  responsavelId: zId().nullable().optional(),
  responsavelTexto: zTextoOpc(120),
  situacao: z.enum(SITUACOES_ATIVO).default('EM_USO'),
  observacao: zTextoOpc(5000),
})
export type CriarAtivo = z.output<typeof CriarAtivoSchema>

export const AtualizarAtivoSchema = CriarAtivoSchema.partial().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  'Informe ao menos um campo.',
)
export type AtualizarAtivo = z.output<typeof AtualizarAtivoSchema>

export const ChamadosDoAtivoQuerySchema = PaginacaoQuerySchema
export type ChamadosDoAtivoQuery = z.output<typeof ChamadosDoAtivoQuerySchema>

export const ativosApi = {
  buscar: contrato({
    metodo: 'GET',
    caminho: '/ativos/busca',
    query: BuscarAtivosQuerySchema,
    resposta: z.array(AtivoBuscaSchema),
  }),
  listar: contrato({
    metodo: 'GET',
    caminho: '/ativos',
    query: ListarAtivosQuerySchema,
    resposta: paginaDe(AtivoSchema),
  }),
  obter: contrato({ metodo: 'GET', caminho: '/ativos/:id', params: IdParamsSchema, resposta: AtivoSchema }),
  chamados: contrato({
    metodo: 'GET',
    caminho: '/ativos/:id/chamados',
    params: IdParamsSchema,
    query: ChamadosDoAtivoQuerySchema,
    resposta: paginaDe(AtivoChamadoSchema),
  }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/ativos',
    body: CriarAtivoSchema,
    resposta: AtivoSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/ativos/:id',
    params: IdParamsSchema,
    body: AtualizarAtivoSchema,
    resposta: AtivoSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/ativos/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
