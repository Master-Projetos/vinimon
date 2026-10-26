// Confere em tempo de compilação que cada união de @vinimon/shared é igual ao enum gerado pelo Prisma.
// Mudou um enum? Mude schema.prisma, packages/shared/src/enums.ts e este arquivo na mesma tarefa.

import type * as Shared from '@vinimon/shared'
import type * as Prisma from '../generated/prisma/enums'

type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

export const _perfil: Igual<Shared.Perfil, Prisma.Perfil> = true
export const _estadoSessao: Igual<Shared.EstadoSessao, Prisma.EstadoSessao> = true
export const _tema: Igual<Shared.Tema, Prisma.Tema> = true
export const _densidade: Igual<Shared.Densidade, Prisma.Densidade> = true
export const _atorAuditoria: Igual<Shared.AtorAuditoria, Prisma.AtorAuditoria> = true
export const _presencaManual: Igual<Shared.PresencaManual, Prisma.PresencaManual> = true
export const _tipoStatus: Igual<Shared.TipoStatus, Prisma.TipoStatus> = true
export const _papelStatus: Igual<Shared.PapelStatus, Prisma.PapelStatus> = true
export const _tipoAssentamento: Igual<Shared.TipoAssentamento, Prisma.TipoAssentamento> = true
export const _tipoEvento: Igual<Shared.TipoEvento, Prisma.TipoEvento> = true
export const _tipoNotificacao: Igual<Shared.TipoNotificacao, Prisma.TipoNotificacao> = true
export const _motivoSeguir: Igual<Shared.MotivoSeguir, Prisma.MotivoSeguir> = true
export const _notaAvaliacao: Igual<Shared.NotaAvaliacao, Prisma.NotaAvaliacao> = true
export const _situacaoAtivo: Igual<Shared.SituacaoAtivo, Prisma.SituacaoAtivo> = true
export const _situacaoArtigo: Igual<Shared.SituacaoArtigo, Prisma.SituacaoArtigo> = true
export const _visibilidadeArtigo: Igual<Shared.VisibilidadeArtigo, Prisma.VisibilidadeArtigo> = true
export const _statusEmail: Igual<Shared.StatusEmail, Prisma.StatusEmail> = true
export const _canalEmail: Igual<Shared.CanalEmail, Prisma.CanalEmail> = true
export const _tipoCampo: Igual<Shared.TipoCampo, Prisma.TipoCampo> = true
export const _visibilidadeCampo: Igual<Shared.VisibilidadeCampo, Prisma.VisibilidadeCampo> = true
