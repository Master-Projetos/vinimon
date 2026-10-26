import { z } from 'zod'
import { NOTAS_AVALIACAO, PAPEIS_STATUS, TIPOS_EVENTO, TIPOS_STATUS } from '../enums'
import { contrato, IdParamsSchema, PaginacaoQuerySchema, paginaDe, zDataHora, zId, zListaIds } from '../http'
import {
  zAssunto,
  zBusca,
  zComentario,
  zContato,
  zDescricao,
  zEmail,
  zMotivo,
  zSolucao,
  zTag,
  zTelefone,
} from '../limites'

// ───────── filtros da lista (§3.6) ─────────

export const VISOES_CHAMADO = [
  'minha-fila',
  'fila-aberta',
  'minha-area',
  'agendados',
  'abertos-por-mim',
  'aguardando-validacao',
  'encerrados',
  'todos',
] as const
export type VisaoChamado = (typeof VISOES_CHAMADO)[number]

export const SLAS_FILTRO = ['NO_PRAZO', 'EM_RISCO', 'ESTOURADO'] as const
export const ORDENS_CHAMADO = ['id', 'abertoEm', 'prioridade', 'ultimaAtividade', 'prazoSolucao'] as const

/** `operadorIds`: 0 = sem operador. */
const zListaIdsOuZero = () =>
  z.preprocess(
    (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]),
    z.array(z.coerce.number().int().min(0).max(2_147_483_647)).max(50).optional(),
  )

const zListaNotas = () =>
  z.preprocess(
    (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]),
    z.array(z.enum(NOTAS_AVALIACAO)).max(4).optional(),
  )

export const ChamadoFiltrosSchema = PaginacaoQuerySchema.extend({
  visao: z.enum(VISOES_CHAMADO).optional(),
  busca: zBusca().optional(),
  statusIds: zListaIds(),
  prioridadeIds: zListaIds(),
  areaIds: zListaIds(),
  problemaIds: zListaIds(),
  operadorIds: zListaIdsOuZero(),
  canalIds: zListaIds(),
  tagIds: zListaIds(),
  tagIdsAlguma: zListaIds(),
  tagIdsNenhuma: zListaIds(),
  departamentoIds: zListaIds(),
  solicitanteId: zId().optional(),
  sla: z.enum(SLAS_FILTRO).optional(),
  avaliacao: zListaNotas(),
  teveRejeicao: z.stringbool().optional(),
  de: z.iso.date().optional(),
  ate: z.iso.date().optional(),
  concluidoDe: z.iso.date().optional(),
  concluidoAte: z.iso.date().optional(),
  ordem: z.enum(ORDENS_CHAMADO).default('id'),
  direcao: z.enum(['asc', 'desc']).default('desc'),
})
export type ChamadoFiltros = z.output<typeof ChamadoFiltrosSchema>

export const ReincidenciaQuerySchema = z.object({ ativoId: zId().optional(), problemaId: zId().optional() })
export type ReincidenciaQuery = z.output<typeof ReincidenciaQuerySchema>

// ───────── bodies ─────────

/** Sem `statusId`: o status inicial vem do papel INICIAL (T36). */
export const CriarChamadoSchema = z.strictObject({
  assunto: zAssunto(),
  descricao: zDescricao(),
  problemaId: zId(),
  areaId: zId().optional(),
  prioridadeId: zId().optional(),
  departamentoId: zId().optional(),
  ativoId: zId().optional(),
  contato: zContato().optional(),
  contatoEmail: zEmail().optional(),
  telefone: zTelefone().optional(),
  solicitanteId: zId().optional(),
  canalId: zId().optional(),
  tags: z.array(zTag()).max(10).optional(),
})
export type CriarChamado = z.output<typeof CriarChamadoSchema>

/** Lock otimista: toda ação informa a versão que o cliente viu. */
const versao = () => z.int().min(0)

export const AssumirChamadoSchema = z.strictObject({
  versao: versao(),
  confirmarTroca: z.boolean().optional(),
  comentario: zComentario().optional(),
})
export const EncaminharChamadoSchema = z.strictObject({
  versao: versao(),
  areaId: zId(),
  operadorId: zId().optional(),
  comentario: zComentario().optional(),
  marcarPrimeiraResposta: z.boolean().optional(),
})
export const StatusChamadoSchema = z.strictObject({ versao: versao(), statusId: zId() })
export const PrioridadeChamadoSchema = z.strictObject({ versao: versao(), prioridadeId: zId() })
export const ClassificacaoChamadoSchema = z.strictObject({
  versao: versao(),
  problemaId: zId().optional(),
  departamentoId: zId().optional(),
  ativoId: zId().optional(),
  canalId: zId().optional(),
})
export const TagsChamadoSchema = z.strictObject({ tags: z.array(zTag()).max(10) })
export const AgendarChamadoSchema = z.strictObject({
  versao: versao(),
  para: z.iso.datetime({ offset: true }),
  operadorId: zId().optional(),
  marcarPrimeiraResposta: z.boolean().optional(),
})
export const ConcluirChamadoSchema = z.strictObject({
  versao: versao(),
  solucao: zSolucao(),
  descricaoTecnica: z.string().trim().max(20_000, { error: 'Máximo de 20.000 caracteres.' }).optional(),
})
export const AprovarChamadoSchema = z.strictObject({
  versao: versao(),
  nota: z.enum(NOTAS_AVALIACAO),
  comentario: z.string().trim().max(1_000, { error: 'Máximo de 1.000 caracteres.' }).optional(),
})
export const RejeitarChamadoSchema = z.strictObject({ versao: versao(), motivo: zMotivo() })
export const SolicitarRetornoSchema = z.strictObject({ versao: versao(), mensagem: zMotivo() })
export const ReabrirChamadoSchema = z.strictObject({ versao: versao(), justificativa: zMotivo() })
export const CancelarChamadoSchema = z.strictObject({ versao: versao(), motivo: zMotivo() })

export type AssumirChamado = z.output<typeof AssumirChamadoSchema>
export type EncaminharChamado = z.output<typeof EncaminharChamadoSchema>
export type StatusChamadoBody = z.output<typeof StatusChamadoSchema>
export type PrioridadeChamadoBody = z.output<typeof PrioridadeChamadoSchema>
export type ClassificacaoChamado = z.output<typeof ClassificacaoChamadoSchema>
export type TagsChamado = z.output<typeof TagsChamadoSchema>
export type AgendarChamado = z.output<typeof AgendarChamadoSchema>
export type ConcluirChamado = z.output<typeof ConcluirChamadoSchema>
export type AprovarChamado = z.output<typeof AprovarChamadoSchema>
export type RejeitarChamado = z.output<typeof RejeitarChamadoSchema>
export type SolicitarRetorno = z.output<typeof SolicitarRetornoSchema>
export type ReabrirChamado = z.output<typeof ReabrirChamadoSchema>
export type CancelarChamado = z.output<typeof CancelarChamadoSchema>

// ───────── respostas ─────────

export const RefSchema = z.object({ id: z.int(), nome: z.string() })
export type Ref = z.output<typeof RefSchema>

export const StatusRefSchema = z.object({
  id: z.int(),
  nome: z.string(),
  tipo: z.enum(TIPOS_STATUS),
  papel: z.enum(PAPEIS_STATUS).nullable(),
  cor: z.string(),
})
export const PrioridadeRefSchema = z.object({ id: z.int(), nome: z.string(), cor: z.string(), ordem: z.int() })

/** Mesmos campos de `DadosSla` (sla.ts): a UI chama `situacaoSla` direto. `prazo` nulo com `meta` = relógio parado. */
export const SlaPrazoSchema = z.object({
  meta: z.int().nullable(),
  prazo: zDataHora().nullable(),
  alerta: zDataHora().nullable(),
  cumprido: z.boolean().nullable(),
  finalizado: z.boolean(),
})
export const ChamadoSlaSchema = z.object({ resposta: SlaPrazoSchema, solucao: SlaPrazoSchema })
export type ChamadoSla = z.output<typeof ChamadoSlaSchema>

export const ACOES_CHAMADO = [
  'assumir',
  'encaminhar',
  'status',
  'prioridade',
  'classificar',
  'tags',
  'agendar',
  'concluir',
  'aprovar',
  'rejeitar',
  'reabrir',
  'cancelar',
  'comentar',
  'comentarInterno',
  'anexar',
] as const
export type AcaoChamado = (typeof ACOES_CHAMADO)[number]
export const ChamadoAcoesSchema = z.object({
  assumir: z.boolean(),
  encaminhar: z.boolean(),
  status: z.boolean(),
  prioridade: z.boolean(),
  classificar: z.boolean(),
  tags: z.boolean(),
  agendar: z.boolean(),
  concluir: z.boolean(),
  aprovar: z.boolean(),
  rejeitar: z.boolean(),
  reabrir: z.boolean(),
  cancelar: z.boolean(),
  comentar: z.boolean(),
  comentarInterno: z.boolean(),
  anexar: z.boolean(),
})
export type ChamadoAcoes = z.output<typeof ChamadoAcoesSchema>

export const ChamadoResumoSchema = z.object({
  id: z.int(),
  assunto: z.string(),
  novo: z.boolean(),
  cancelado: z.boolean(),
  status: StatusRefSchema,
  prioridade: PrioridadeRefSchema,
  area: RefSchema,
  problema: RefSchema.nullable(),
  solicitante: RefSchema,
  operador: RefSchema.nullable(),
  abertoEm: zDataHora(),
  agendadoPara: zDataHora().nullable(),
  ultimaAtividadeEm: zDataHora(),
  ultimaInteracao: z.object({ em: zDataHora(), autorId: z.int().nullable() }).nullable(),
  naoLido: z.boolean(),
  qtdAnexos: z.int(),
  sla: ChamadoSlaSchema,
})
export type ChamadoResumo = z.output<typeof ChamadoResumoSchema>

export const ChamadoDetalheSchema = ChamadoResumoSchema.extend({
  descricao: z.string(),
  solucao: z.string().nullable(),
  /** Omitido para quem não passa em `podeVerInterno`. */
  descricaoTecnica: z.string().nullable().optional(),
  contato: z.string().nullable(),
  contatoEmail: z.string().nullable(),
  telefone: z.string().nullable(),
  abertoPor: RefSchema,
  canal: RefSchema,
  departamento: RefSchema.nullable(),
  ativo: z.object({ id: z.int(), etiqueta: z.string() }).nullable(),
  primeiraRespostaEm: zDataHora().nullable(),
  concluidoEm: zDataHora().nullable(),
  encerradoEm: zDataHora().nullable(),
  validacaoLimiteEm: zDataHora().nullable(),
  statusDesde: zDataHora(),
  rejeicoes: z.int(),
  versao: z.int(),
  participantes: z.array(
    z.object({ id: z.int(), nome: z.string(), papel: z.enum(['SOLICITANTE', 'OPERADOR', 'SEGUIDOR']) }),
  ),
  /** Só para a equipe (`chamado.atender`). */
  tags: z.array(RefSchema).optional(),
  avaliacao: z
    .object({
      nota: z.enum(NOTAS_AVALIACAO),
      comentario: z.string().nullable(),
      automatica: z.boolean(),
      criadoEm: zDataHora(),
    })
    .nullable(),
  seguindo: z.boolean(),
  acoes: ChamadoAcoesSchema,
})
export type ChamadoDetalhe = z.output<typeof ChamadoDetalheSchema>

export const ChamadoContagensSchema = z.object({
  'minha-fila': z.int(),
  'fila-aberta': z.int(),
  'minha-area': z.int(),
  agendados: z.int(),
  'abertos-por-mim': z.int(),
  'aguardando-validacao': z.int(),
  // ausentes para quem vê tudo (`chamado.verTodos`): contar a tabela inteira é caro e o selo só importa nas filas abertas
  encerrados: z.int().optional(),
  todos: z.int().optional(),
})
export type ChamadoContagens = z.output<typeof ChamadoContagensSchema>

export const ChamadoEventoSchema = z.object({
  id: z.int(),
  tipo: z.enum(TIPOS_EVENTO),
  ator: RefSchema.nullable(),
  dados: z.record(z.string(), z.unknown()),
  criadoEm: zDataHora(),
})
export type ChamadoEvento = z.output<typeof ChamadoEventoSchema>

export const ItemReincidenciaSchema = z.object({
  id: z.int(),
  assunto: z.string(),
  abertoEm: zDataHora(),
  emAberto: z.boolean(),
})
export const ReincidenciaSchema = z.object({
  ativo: z.array(ItemReincidenciaSchema),
  solicitante: z.array(ItemReincidenciaSchema),
})
export type Reincidencia = z.output<typeof ReincidenciaSchema>

// ───────── contratos ─────────

const acao = <const B extends z.ZodType>(
  caminho: `/chamados/:id/${string}`,
  body: B,
  metodo: 'POST' | 'PUT' = 'POST',
) => contrato({ metodo, caminho, params: IdParamsSchema, body, resposta: ChamadoDetalheSchema })

export const chamadosApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/chamados',
    query: ChamadoFiltrosSchema,
    resposta: paginaDe(ChamadoResumoSchema),
  }),
  contagens: contrato({ metodo: 'GET', caminho: '/chamados/contagens', resposta: ChamadoContagensSchema }),
  reincidencia: contrato({
    metodo: 'GET',
    caminho: '/chamados/reincidencia',
    query: ReincidenciaQuerySchema,
    resposta: ReincidenciaSchema,
  }),
  criar: contrato({
    metodo: 'POST',
    caminho: '/chamados',
    body: CriarChamadoSchema,
    resposta: ChamadoDetalheSchema,
    status: 201,
  }),
  obter: contrato({ metodo: 'GET', caminho: '/chamados/:id', params: IdParamsSchema, resposta: ChamadoDetalheSchema }),
  historico: contrato({
    metodo: 'GET',
    caminho: '/chamados/:id/historico',
    params: IdParamsSchema,
    resposta: z.array(ChamadoEventoSchema),
  }),
  assumir: acao('/chamados/:id/assumir', AssumirChamadoSchema),
  encaminhar: acao('/chamados/:id/encaminhar', EncaminharChamadoSchema),
  status: acao('/chamados/:id/status', StatusChamadoSchema),
  prioridade: acao('/chamados/:id/prioridade', PrioridadeChamadoSchema),
  classificacao: acao('/chamados/:id/classificacao', ClassificacaoChamadoSchema),
  tags: acao('/chamados/:id/tags', TagsChamadoSchema, 'PUT'),
  agendar: acao('/chamados/:id/agendar', AgendarChamadoSchema),
  concluir: acao('/chamados/:id/concluir', ConcluirChamadoSchema),
  aprovar: acao('/chamados/:id/aprovar', AprovarChamadoSchema),
  rejeitar: acao('/chamados/:id/rejeitar', RejeitarChamadoSchema),
  solicitarRetorno: acao('/chamados/:id/solicitar-retorno', SolicitarRetornoSchema),
  reabrir: acao('/chamados/:id/reabrir', ReabrirChamadoSchema),
  cancelar: acao('/chamados/:id/cancelar', CancelarChamadoSchema),
  seguir: contrato({
    metodo: 'PUT',
    caminho: '/chamados/:id/seguir',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
  deixarDeSeguir: contrato({
    metodo: 'DELETE',
    caminho: '/chamados/:id/seguir',
    params: IdParamsSchema,
    resposta: z.undefined(),
    status: 204,
  }),
}
