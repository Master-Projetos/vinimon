import { z } from 'zod'
import { PAPEIS_STATUS, type PapelStatus, TIPOS_STATUS, type TipoStatus } from '../enums'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe } from '../http'
import { zCor } from '../limites'

export const StatusSchema = z.object({
  id: z.int(),
  nome: z.string(),
  tipo: z.enum(TIPOS_STATUS),
  papel: z.enum(PAPEIS_STATUS).nullable(),
  cor: z.string(),
  pausaSla: z.boolean(),
  ignorado: z.boolean(),
  ordem: z.int(),
  ativo: z.boolean(),
})
export type Status = z.output<typeof StatusSchema>

/** Tabela papel → tipo do CHECK `ck_status_papel` (04-dados §4.3). Papel nulo não tem restrição. */
export const TIPO_POR_PAPEL: Record<PapelStatus, TipoStatus> = {
  INICIAL: 'ABERTO',
  EM_ATENDIMENTO: 'EM_ATENDIMENTO',
  ENCAMINHADO: 'EM_ATENDIMENTO',
  AGUARDANDO_SOLICITANTE: 'PENDENTE',
  AGENDADO: 'AGENDADO',
  CONCLUIDO: 'CONCLUIDO',
  ENCERRADO: 'ENCERRADO',
  CANCELADO: 'ENCERRADO',
}

export interface EstadoStatus {
  tipo?: TipoStatus
  papel?: PapelStatus | null
  pausaSla?: boolean
}

export interface ProblemaStatus {
  campo: 'tipo' | 'papel' | 'pausaSla'
  mensagem: string
}

/**
 * Regras cruzadas papel × tipo × pausaSla (CHECKs `ck_status_papel` e `ck_status_pausa_final`).
 * Compara só os campos informados; no PATCH, o service confere o estado final com o que já está gravado.
 */
export function regrasDoStatus(estado: EstadoStatus): ProblemaStatus[] {
  const problemas: ProblemaStatus[] = []
  if (estado.tipo !== undefined && estado.papel) {
    const tipoEsperado = TIPO_POR_PAPEL[estado.papel]
    if (estado.tipo !== tipoEsperado) {
      problemas.push({ campo: 'tipo', mensagem: `O papel ${estado.papel} exige o tipo ${tipoEsperado}.` })
    }
  }
  if ((estado.tipo === 'CONCLUIDO' || estado.tipo === 'ENCERRADO') && estado.pausaSla === false) {
    problemas.push({ campo: 'pausaSla', mensagem: 'Status concluído ou encerrado precisa pausar o SLA.' })
  }
  return problemas
}

const camposStatus = z.strictObject({
  nome: z.string().trim().min(2, 'Informe ao menos 2 caracteres.').max(60, 'Use no máximo 60 caracteres.'),
  tipo: z.enum(TIPOS_STATUS, { error: 'Escolha um tipo de status válido.' }),
  papel: z.enum(PAPEIS_STATUS, { error: 'Escolha um papel de status válido.' }).nullable(),
  cor: zCor(),
  pausaSla: z.boolean(),
  ignorado: z.boolean(),
  ordem: z.int(),
  ativo: z.boolean(),
})

const aplicarRegrasStatus = (d: EstadoStatus, ctx: z.RefinementCtx) => {
  for (const problema of regrasDoStatus(d)) {
    ctx.addIssue({ code: 'custom', message: problema.mensagem, path: [problema.campo] })
  }
}

export const CriarStatusSchema = camposStatus.superRefine(aplicarRegrasStatus)
export type CriarStatus = z.output<typeof CriarStatusSchema>

export const AtualizarStatusSchema = camposStatus
  .partial()
  .superRefine(aplicarRegrasStatus)
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Informe ao menos um campo.')
export type AtualizarStatus = z.output<typeof AtualizarStatusSchema>

export const ListarStatusQuerySchema = PaginacaoQuerySchema.extend({
  busca: z.string().trim().max(100).optional(),
  ativo: z.stringbool().optional(),
  direcao: z.enum(['asc', 'desc']).default('asc'),
})
export type ListarStatusQuery = z.output<typeof ListarStatusQuerySchema>

export const statusApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/status',
    query: ListarStatusQuerySchema,
    resposta: paginaDe(StatusSchema),
  }),
  obter: contrato({ metodo: 'GET', caminho: '/status/:id', params: IdParamsSchema, resposta: StatusSchema }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/status',
    body: CriarStatusSchema,
    resposta: StatusSchema,
    status: 201,
  }),
  atualizar: contrato({
    metodo: 'PATCH',
    caminho: '/status/:id',
    params: IdParamsSchema,
    body: AtualizarStatusSchema,
    resposta: StatusSchema,
  }),
  excluir: contrato({
    metodo: 'DELETE',
    caminho: '/status/:id',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
