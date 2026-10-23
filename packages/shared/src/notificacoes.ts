import { z } from 'zod'
import { TIPOS_NOTIFICACAO, type TipoNotificacao } from './enums'
import { zDataHora } from './http'
import type { Perfil } from './permissoes'

/** Tipos de notificação in-app que o usuário não consegue desligar (§3.8). */
export const TIPOS_INAPP_FIXOS = ['MENCAO', 'ATRIBUIDO', 'AVALIACAO_PENDENTE'] as const

export type PreferenciaNotificacao = { inapp: boolean; desktop: boolean; fixo: boolean }

function ehFixo(tipo: TipoNotificacao): boolean {
  return (TIPOS_INAPP_FIXOS as readonly string[]).includes(tipo)
}

/**
 * Preferência padrão por tipo (tabela de preferências da §3.8).
 * O `perfil` faz parte da assinatura pedida pelo cartão, mas a tabela da §3.8 não
 * diferencia por perfil: hoje o resultado é o mesmo para todos.
 */
export function preferenciaPadrao(tipo: TipoNotificacao, _perfil: Perfil): PreferenciaNotificacao {
  if (ehFixo(tipo)) return { inapp: true, desktop: true, fixo: true }
  if (tipo === 'STATUS' || tipo === 'ATUALIZACAO' || tipo === 'AVALIACAO_RECEBIDA') {
    return { inapp: true, desktop: false, fixo: false }
  }
  return { inapp: true, desktop: true, fixo: false }
}

/** Aplica a regra "desligar o in-app desliga o desktop"; tipos fixos ficam sempre ligados no in-app. */
export function preferenciaEfetiva(
  tipo: TipoNotificacao,
  preferencia: { inapp: boolean; desktop: boolean },
): { inapp: boolean; desktop: boolean } {
  const inapp = ehFixo(tipo) ? true : preferencia.inapp
  return { inapp, desktop: inapp && preferencia.desktop }
}

/** Só rótulos de sistema; nunca texto de usuário (S102). `marco`: RISCO, ESTOURADO ou RESPOSTA_ESTOURADO. */
export const NotificacaoDadosSchema = z.strictObject({
  areaNome: z.string().optional(),
  prazoEm: zDataHora().optional(),
  statusNome: z.string().optional(),
  marco: z.string().optional(),
})

export const NotificacaoDTOSchema = z.strictObject({
  id: z.int(),
  tipo: z.enum(TIPOS_NOTIFICACAO),
  chamado: z.strictObject({ id: z.int(), assunto: z.string() }),
  atores: z.array(z.strictObject({ id: z.int(), nome: z.string() })),
  contagem: z.int().min(1),
  interno: z.boolean(),
  trecho: z.string().nullable(),
  assentamentoId: z.int().nullable(),
  dados: NotificacaoDadosSchema.nullable().optional(),
  criadoEm: zDataHora(),
  atualizadoEm: zDataHora(),
  lida: z.boolean(),
})
export type NotificacaoDTO = z.infer<typeof NotificacaoDTOSchema>

type EntradaTexto = Pick<NotificacaoDTO, 'tipo' | 'chamado' | 'atores' | 'contagem' | 'dados'>

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome
}

type Atores = { sujeito: string; plural: boolean }

function descreverAtores(atores: EntradaTexto['atores']): Atores {
  const [a, b] = atores
  if (!a) return { sujeito: 'Alguém', plural: false }
  if (!b) return { sujeito: a.nome, plural: false }
  if (atores.length === 2) return { sujeito: `${primeiroNome(a.nome)} e ${primeiroNome(b.nome)}`, plural: true }
  const outros = atores.length - 1
  return { sujeito: `${primeiroNome(a.nome)} e mais ${outros} pessoas`, plural: true }
}

function horaNoFuso(data: Date, fuso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(data)
}

/** Texto da notificação (§5.10). Nunca inclui texto digitado por usuário (S102). */
export function textoNotificacao(n: EntradaTexto, fuso = 'America/Sao_Paulo'): string {
  const ref = `#${n.chamado.id}`
  const { sujeito, plural } = descreverAtores(n.atores)
  const semAtor = n.atores.length === 0
  const dados = n.dados ?? {}
  switch (n.tipo) {
    case 'MENCAO':
      return `${sujeito} ${plural ? 'mencionaram' : 'mencionou'} você em ${ref}`
    case 'COMENTARIO':
      if (n.atores.length === 1 && n.contagem > 1) return `${sujeito} adicionou ${n.contagem} comentários em ${ref}`
      return `${sujeito} ${plural ? 'comentaram' : 'comentou'} em ${ref}`
    case 'STATUS': {
      if (semAtor) return dados.statusNome ? `${ref} mudou para ${dados.statusNome}` : `O status de ${ref} foi alterado`
      const verbo = plural ? 'alteraram' : 'alterou'
      return `${sujeito} ${verbo} o status de ${ref}${dados.statusNome ? ` para ${dados.statusNome}` : ''}`
    }
    case 'NOVO_NA_FILA':
      return `Novo chamado ${ref} na fila${dados.areaNome ? ` de ${dados.areaNome}` : ''}`
    case 'SLA': {
      if (dados.marco === 'RESPOSTA_ESTOURADO') return `O prazo de resposta de ${ref} venceu`
      if (dados.marco === 'ESTOURADO') return `O prazo de solução de ${ref} venceu`
      if (dados.prazoEm) return `O prazo de solução de ${ref} vence às ${horaNoFuso(dados.prazoEm, fuso)}`
      return `O prazo de solução de ${ref} vence em breve`
    }
    case 'AVALIACAO_PENDENTE':
      return `${ref} foi encerrado. Confirme a solução e avalie o atendimento.`
    case 'ATRIBUIDO':
      return `${sujeito} ${plural ? 'atribuíram' : 'atribuiu'} ${ref} a você`
    case 'ATUALIZACAO':
      return semAtor ? `${ref} foi atualizado` : `${sujeito} ${plural ? 'atualizaram' : 'atualizou'} ${ref}`
    case 'AVALIACAO_RECEBIDA':
      return `${sujeito} ${plural ? 'avaliaram' : 'avaliou'} o atendimento de ${ref}`
    case 'REJEITADO':
      return semAtor
        ? `A solução de ${ref} foi rejeitada`
        : `${sujeito} ${plural ? 'rejeitaram' : 'rejeitou'} a solução de ${ref}`
  }
}
