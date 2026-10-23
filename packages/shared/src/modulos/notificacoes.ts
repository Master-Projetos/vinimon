import { z } from 'zod'
import { TIPOS_NOTIFICACAO } from '../enums'
import { contrato, IdParamsSchema, zId } from '../http'
import { NotificacaoDTOSchema, TIPOS_INAPP_FIXOS } from '../notificacoes'

export const FILTROS_NOTIFICACAO = ['todas', 'nao_lidas', 'mencoes', 'atribuicoes', 'sla'] as const
export type FiltroNotificacao = (typeof FILTROS_NOTIFICACAO)[number]

export const ListarNotificacoesQuerySchema = z.object({
  filtro: z.enum(FILTROS_NOTIFICACAO).default('todas'),
  /** `base64url("<atualizadoEmISO>|<id>")` da última notificação da página anterior. */
  cursor: z.string().max(100).optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
})
export type ListarNotificacoesQuery = z.output<typeof ListarNotificacoesQuerySchema>

export const NotificacoesPaginaSchema = z.object({
  itens: z.array(NotificacaoDTOSchema),
  proximoCursor: z.string().nullable(),
})
export type NotificacoesPagina = z.output<typeof NotificacoesPaginaSchema>

export const ContagemNotificacoesSchema = z.object({ naoLidas: z.int().min(0) })
export type ContagemNotificacoes = z.output<typeof ContagemNotificacoesSchema>

export const MarcarTodasLidasSchema = z.strictObject({ chamadoId: zId().optional() })
export type MarcarTodasLidas = z.output<typeof MarcarTodasLidasSchema>

export const PreferenciaItemSchema = z.strictObject({
  tipo: z.enum(TIPOS_NOTIFICACAO),
  inApp: z.boolean(),
  desktop: z.boolean(),
})
export type PreferenciaItem = z.output<typeof PreferenciaItemSchema>

export const AtualizarPreferenciasSchema = z.strictObject({
  itens: z
    .array(PreferenciaItemSchema)
    .max(TIPOS_NOTIFICACAO.length)
    .superRefine((itens, ctx) => {
      itens.forEach((item, i) => {
        if ((TIPOS_INAPP_FIXOS as readonly string[]).includes(item.tipo) && !item.inApp)
          ctx.addIssue({ code: 'custom', path: [i, 'inApp'], message: 'Este tipo de aviso não pode ser desligado.' })
      })
      if (new Set(itens.map((i) => i.tipo)).size !== itens.length)
        ctx.addIssue({ code: 'custom', message: 'Há tipos repetidos.' })
    }),
})
export type AtualizarPreferencias = z.output<typeof AtualizarPreferenciasSchema>

export const PreferenciasNotificacaoSchema = z.object({
  itens: z.array(PreferenciaItemSchema.extend({ fixo: z.boolean() })),
})
export type PreferenciasNotificacao = z.output<typeof PreferenciasNotificacaoSchema>

export const notificacoesApi = {
  listar: contrato({
    metodo: 'GET',
    caminho: '/notificacoes',
    query: ListarNotificacoesQuerySchema,
    resposta: NotificacoesPaginaSchema,
  }),
  contagem: contrato({ metodo: 'GET', caminho: '/notificacoes/contagem', resposta: ContagemNotificacoesSchema }),
  marcarLida: contrato({
    metodo: 'POST',
    caminho: '/notificacoes/:id/lida',
    params: IdParamsSchema,
    resposta: ContagemNotificacoesSchema,
  }),
  marcarNaoLida: contrato({
    metodo: 'POST',
    caminho: '/notificacoes/:id/nao-lida',
    params: IdParamsSchema,
    resposta: ContagemNotificacoesSchema,
  }),
  marcarTodasLidas: contrato({
    metodo: 'POST',
    caminho: '/notificacoes/lidas',
    body: MarcarTodasLidasSchema,
    resposta: ContagemNotificacoesSchema,
  }),
  preferencias: contrato({
    metodo: 'GET',
    caminho: '/me/preferencias-notificacao',
    resposta: PreferenciasNotificacaoSchema,
  }),
  atualizarPreferencias: contrato({
    metodo: 'PUT',
    caminho: '/me/preferencias-notificacao',
    body: AtualizarPreferenciasSchema,
    resposta: PreferenciasNotificacaoSchema,
  }),
}
