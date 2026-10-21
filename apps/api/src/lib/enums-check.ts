import type {
  AtorAuditoria,
  Densidade,
  EstadoSessao,
  MotivoSeguir,
  NotaAvaliacao,
  PapelStatus,
  Perfil,
  PresencaManual,
  SituacaoArtigo,
  SituacaoAtivo,
  Tema,
  TipoAssentamento,
  TipoEvento,
  TipoNotificacao,
  TipoStatus,
  VisibilidadeArtigo,
} from '@vinimon/shared'
import type {
  AtorAuditoria as PrismaAtorAuditoria,
  Densidade as PrismaDensidade,
  EstadoSessao as PrismaEstadoSessao,
  MotivoSeguir as PrismaMotivoSeguir,
  NotaAvaliacao as PrismaNotaAvaliacao,
  PapelStatus as PrismaPapelStatus,
  Perfil as PrismaPerfil,
  PresencaManual as PrismaPresencaManual,
  SituacaoArtigo as PrismaSituacaoArtigo,
  SituacaoAtivo as PrismaSituacaoAtivo,
  Tema as PrismaTema,
  TipoAssentamento as PrismaTipoAssentamento,
  TipoEvento as PrismaTipoEvento,
  TipoNotificacao as PrismaTipoNotificacao,
  TipoStatus as PrismaTipoStatus,
  VisibilidadeArtigo as PrismaVisibilidadeArtigo,
} from '../generated/prisma/enums'

type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

// Enums do schema.prisma e de packages/shared/src/enums.ts mudam juntos: divergência falha no typecheck.
export const _perfil: Igual<Perfil, PrismaPerfil> = true
export const _estadoSessao: Igual<EstadoSessao, PrismaEstadoSessao> = true
export const _tema: Igual<Tema, PrismaTema> = true
export const _densidade: Igual<Densidade, PrismaDensidade> = true
export const _atorAuditoria: Igual<AtorAuditoria, PrismaAtorAuditoria> = true
export const _presencaManual: Igual<PresencaManual, PrismaPresencaManual> = true
export const _tipoStatus: Igual<TipoStatus, PrismaTipoStatus> = true
export const _papelStatus: Igual<PapelStatus, PrismaPapelStatus> = true
export const _tipoAssentamento: Igual<TipoAssentamento, PrismaTipoAssentamento> = true
export const _tipoEvento: Igual<TipoEvento, PrismaTipoEvento> = true
export const _tipoNotificacao: Igual<TipoNotificacao, PrismaTipoNotificacao> = true
export const _motivoSeguir: Igual<MotivoSeguir, PrismaMotivoSeguir> = true
export const _notaAvaliacao: Igual<NotaAvaliacao, PrismaNotaAvaliacao> = true
export const _situacaoAtivo: Igual<SituacaoAtivo, PrismaSituacaoAtivo> = true
export const _situacaoArtigo: Igual<SituacaoArtigo, PrismaSituacaoArtigo> = true
export const _visibilidadeArtigo: Igual<VisibilidadeArtigo, PrismaVisibilidadeArtigo> = true
