import { z } from 'zod'

// Contrato de tempo real (§3.7). Eventos C→S validados com Zod (S95); S→C só tipados.

export type ErroRt = 'INVALIDO' | 'INDISPONIVEL' | 'LIMITE_SALAS' | 'RATE_LIMIT'

export const ChamadoEntrarSchema = z.strictObject({ chamadoId: z.int().positive() })
export const ChamadoSairSchema = z.strictObject({ chamadoId: z.int().positive() })
export const ChamadoDigitandoSchema = z.strictObject({
  chamadoId: z.int().positive(),
  interno: z.boolean(),
  digitando: z.boolean(),
})
export const PresencaAtividadeSchema = z.strictObject({ ativo: z.boolean() })
export const PresencaAssinarSchema = z.strictObject({ usuarioIds: z.array(z.int().positive()).max(200) })

export type ChamadoEntrar = z.output<typeof ChamadoEntrarSchema>
export type ChamadoSair = z.output<typeof ChamadoSairSchema>
export type ChamadoDigitando = z.output<typeof ChamadoDigitandoSchema>
export type PresencaAtividade = z.output<typeof PresencaAtividadeSchema>
export type PresencaAssinar = z.output<typeof PresencaAssinarSchema>

export type EstadoPresenca = 'DISPONIVEL' | 'OCUPADO' | 'AUSENTE' | 'OFFLINE'
export type CampoChamadoRt =
  | 'status'
  | 'prioridade'
  | 'area'
  | 'operador'
  | 'agendamento'
  | 'anexos'
  | 'tags'
  | 'classificacao'
  | 'avaliacao'
export type MotivoFilaRt = 'criado' | 'atribuido' | 'status' | 'encaminhado' | 'prioridade'
export type MotivoSessaoEncerrada = 'logout' | 'revogada' | 'expirada' | 'usuario_desativado'

/** Itens de DTO ainda sem contrato próprio; as tarefas de notificações/assentamentos os refinam. */
export type AssentamentoRt = { id: number } & Record<string, unknown>
export type NotificacaoRt = { id: number } & Record<string, unknown>

export type AckEntrar = { ok: true } | { ok: false; erro: ErroRt }
export type AckAssinar =
  | { ok: true; presencas: Array<{ usuarioId: number; estado: EstadoPresenca; ultimoVistoEm?: string }> }
  | { ok: false; erro: ErroRt }

export interface EventosCliente {
  'chamado:entrar': (payload: ChamadoEntrar, ack: (r: AckEntrar) => void) => void
  'chamado:sair': (payload: ChamadoSair) => void
  'chamado:digitando': (payload: ChamadoDigitando) => void
  'presenca:atividade': (payload: PresencaAtividade) => void
  'presenca:assinar': (payload: PresencaAssinar, ack: (r: AckAssinar) => void) => void
}

export interface EventosServidor {
  'assentamento:novo': (p: { chamadoId: number; assentamento: AssentamentoRt }) => void
  'chamado:atualizado': (p: { chamadoId: number; campos: CampoChamadoRt[] }) => void
  'chamado:digitando': (p: {
    chamadoId: number
    usuario: { id: number; nome: string }
    interno: boolean
    digitando: boolean
  }) => void
  'chamado:leitura': (p: { chamadoId: number; usuarioId: number; ultimoAssentamentoId: number; lidoEm: string }) => void
  'chamado:acessoRevogado': (p: { chamadoId: number }) => void
  'fila:atualizada': (p: { chamadoId: number; motivo: MotivoFilaRt }) => void
  'presenca:mudou': (p: { usuarioId: number; estado: EstadoPresenca }) => void
  'presenca:propria': (p: { estado: EstadoPresenca; manual: 'OCUPADO' | 'AUSENTE' | null; ate: string | null }) => void
  'notificacao:nova': (p: { notificacao: NotificacaoRt; naoLidas: number }) => void
  'notificacao:contagem': (p: { naoLidas: number }) => void
  'sessao:encerrada': (p: { motivo: MotivoSessaoEncerrada }) => void
}
