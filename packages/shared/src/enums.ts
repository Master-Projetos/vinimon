// Um array `as const` por enum do schema.prisma (§4.2). apps/api/src/lib/enums-check.ts confere em tempo de
// compilação que cada união é igual ao enum gerado pelo Prisma: mudou um, mude o outro na mesma tarefa.
export { PERFIS, type Perfil } from './permissoes'

export const ESTADOS_SESSAO = ['PENDENTE_MFA', 'CADASTRO_MFA', 'TROCA_SENHA', 'ATIVA'] as const
export type EstadoSessao = (typeof ESTADOS_SESSAO)[number]

export const TEMAS = ['CLARO', 'ESCURO', 'SISTEMA'] as const
export type Tema = (typeof TEMAS)[number]

export const DENSIDADES = ['CONFORTAVEL', 'COMPACTA'] as const
export type Densidade = (typeof DENSIDADES)[number]

export const ATORES_AUDITORIA = ['USUARIO', 'TOKEN', 'SISTEMA'] as const
export type AtorAuditoria = (typeof ATORES_AUDITORIA)[number]

export const PRESENCAS_MANUAIS = ['OCUPADO', 'AUSENTE'] as const
export type PresencaManual = (typeof PRESENCAS_MANUAIS)[number]

export const TIPOS_STATUS = ['ABERTO', 'EM_ATENDIMENTO', 'PENDENTE', 'AGENDADO', 'CONCLUIDO', 'ENCERRADO'] as const
export type TipoStatus = (typeof TIPOS_STATUS)[number]

export const PAPEIS_STATUS = [
  'INICIAL',
  'EM_ATENDIMENTO',
  'ENCAMINHADO',
  'AGUARDANDO_SOLICITANTE',
  'AGENDADO',
  'CONCLUIDO',
  'ENCERRADO',
  'CANCELADO',
] as const
export type PapelStatus = (typeof PAPEIS_STATUS)[number]

export const TIPOS_ASSENTAMENTO = ['COMENTARIO', 'SISTEMA'] as const
export type TipoAssentamento = (typeof TIPOS_ASSENTAMENTO)[number]

export const TIPOS_EVENTO = [
  'CRIADO',
  'COMENTARIO',
  'ASSUMIDO',
  'ENCAMINHADO',
  'STATUS_ALTERADO',
  'PRIORIDADE_ALTERADA',
  'CLASSIFICACAO_ALTERADA',
  'TAGS_ALTERADAS',
  'AGENDADO',
  'RETORNO_AGENDAMENTO',
  'CONCLUIDO',
  'APROVADO',
  'REJEITADO',
  'AUTO_APROVADO',
  'SOLICITADO_RETORNO',
  'AUTO_ENCERRADO',
  'REABERTO',
  'CANCELADO',
  'ANEXO_ADICIONADO',
  'ANEXO_REMOVIDO',
  'SLA_RISCO',
  'SLA_ESTOURADO',
  'SLA_RESPOSTA_ESTOURADO',
] as const
export type TipoEvento = (typeof TIPOS_EVENTO)[number]

export const TIPOS_NOTIFICACAO = [
  'MENCAO',
  'ATRIBUIDO',
  'NOVO_NA_FILA',
  'COMENTARIO',
  'STATUS',
  'ATUALIZACAO',
  'SLA',
  'AVALIACAO_PENDENTE',
  'AVALIACAO_RECEBIDA',
  'REJEITADO',
] as const
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number]

export const MOTIVOS_SEGUIR = ['SOLICITANTE', 'ABRIU', 'ATRIBUIDO', 'COMENTOU', 'MENCIONADO', 'MANUAL'] as const
export type MotivoSeguir = (typeof MOTIVOS_SEGUIR)[number]

export const NOTAS_AVALIACAO = ['OTIMO', 'BOM', 'REGULAR', 'RUIM'] as const
export type NotaAvaliacao = (typeof NOTAS_AVALIACAO)[number]

export const SITUACOES_ATIVO = ['EM_USO', 'EM_ESTOQUE', 'EM_MANUTENCAO', 'BAIXADO'] as const
export type SituacaoAtivo = (typeof SITUACOES_ATIVO)[number]

export const SITUACOES_ARTIGO = ['RASCUNHO', 'PUBLICADO', 'ARQUIVADO'] as const
export type SituacaoArtigo = (typeof SITUACOES_ARTIGO)[number]

export const VISIBILIDADES_ARTIGO = ['PUBLICO', 'INTERNO'] as const
export type VisibilidadeArtigo = (typeof VISIBILIDADES_ARTIGO)[number]

export const STATUS_EMAIL = ['PENDENTE', 'ENVIADO', 'FALHOU'] as const
export type StatusEmail = (typeof STATUS_EMAIL)[number]

/** Canal de e-mail por tipo de notificação: nunca, na hora (IMEDIATO) ou no resumo diário (RESUMO). */
export const CANAIS_EMAIL = ['NUNCA', 'IMEDIATO', 'RESUMO'] as const
export type CanalEmail = (typeof CANAIS_EMAIL)[number]
