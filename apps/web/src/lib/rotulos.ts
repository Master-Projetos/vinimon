import {
  type NotaAvaliacao,
  type PapelStatus,
  type PresencaManual,
  ROTULOS_PERFIL,
  type SituacaoArtigo,
  type SituacaoAtivo,
  type TipoNotificacao,
  type TipoStatus,
} from '@vinimon/shared'

export { ROTULOS_PERFIL }

export const ROTULOS_TIPO_STATUS: Record<TipoStatus, string> = {
  ABERTO: 'Aberto',
  EM_ATENDIMENTO: 'Em atendimento',
  PENDENTE: 'Pendente',
  AGENDADO: 'Agendado',
  CONCLUIDO: 'Concluído',
  ENCERRADO: 'Encerrado',
}

export const ROTULOS_PAPEL_STATUS: Record<PapelStatus, string> = {
  INICIAL: 'Inicial',
  EM_ATENDIMENTO: 'Em atendimento',
  ENCAMINHADO: 'Encaminhado',
  AGUARDANDO_SOLICITANTE: 'Aguardando solicitante',
  AGENDADO: 'Agendado',
  CONCLUIDO: 'Concluído',
  ENCERRADO: 'Encerrado',
  CANCELADO: 'Cancelado',
}

export const ROTULOS_SITUACAO_ATIVO: Record<SituacaoAtivo, string> = {
  EM_USO: 'Em uso',
  EM_ESTOQUE: 'Em estoque',
  EM_MANUTENCAO: 'Em manutenção',
  BAIXADO: 'Baixado',
}

export const ROTULOS_SITUACAO_ARTIGO: Record<SituacaoArtigo, string> = {
  RASCUNHO: 'Rascunho',
  PUBLICADO: 'Publicado',
  ARQUIVADO: 'Arquivado',
}

export const ROTULOS_NOTA_AVALIACAO: Record<NotaAvaliacao, string> = {
  OTIMO: 'Ótimo',
  BOM: 'Bom',
  REGULAR: 'Regular',
  RUIM: 'Ruim',
}

export const ROTULOS_PRESENCA: Record<PresencaManual, string> = {
  OCUPADO: 'Ocupado',
  AUSENTE: 'Ausente',
}

export const ROTULOS_TIPO_NOTIFICACAO: Record<TipoNotificacao, string> = {
  MENCAO: 'Menção',
  ATRIBUIDO: 'Atribuído a você',
  NOVO_NA_FILA: 'Novo na fila',
  COMENTARIO: 'Comentário',
  STATUS: 'Mudança de status',
  ATUALIZACAO: 'Atualização',
  SLA: 'Prazo de SLA',
  AVALIACAO_PENDENTE: 'Avaliação pendente',
  AVALIACAO_RECEBIDA: 'Avaliação recebida',
  REJEITADO: 'Rejeitado',
}

// Visões da fila (03-arquitetura §3.6) e situações de SLA (04-dados, `sla.ts`): as uniões ainda não existem em @vinimon/shared.
export type VisaoChamado =
  | 'minha-fila'
  | 'fila-aberta'
  | 'minha-area'
  | 'agendados'
  | 'abertos-por-mim'
  | 'aguardando-validacao'
  | 'encerrados'
  | 'todos'

export const ROTULOS_VISAO: Record<VisaoChamado, string> = {
  'minha-fila': 'Minha fila',
  'fila-aberta': 'Fila aberta',
  'minha-area': 'Minha área',
  agendados: 'Agendados',
  'abertos-por-mim': 'Abertos por mim',
  'aguardando-validacao': 'Aguardando validação',
  encerrados: 'Encerrados',
  todos: 'Todos',
}

export type SituacaoSlaRotulo = 'SEM_SLA' | 'NO_PRAZO' | 'EM_RISCO' | 'ESTOURADO' | 'PAUSADO' | 'CUMPRIDO' | 'VIOLADO'

export const ROTULOS_SITUACAO_SLA: Record<SituacaoSlaRotulo, string> = {
  SEM_SLA: 'Sem SLA',
  NO_PRAZO: 'No prazo',
  EM_RISCO: 'Em risco',
  ESTOURADO: 'Estourado',
  PAUSADO: 'Pausado',
  CUMPRIDO: 'Cumprido',
  VIOLADO: 'Violado',
}
