import { type ChamadoAcoes, type Config, type PapelStatus, type TipoStatus, temPermissao } from '@vinimon/shared'
import type { Prisma } from '../generated/prisma/client'
import type { UsuarioSessao } from '../lib/sessao'

export interface ChamadoEscopo {
  areaId: number
  operadorId: number | null
  solicitanteId: number
  /** Operadores auxiliares (T-15.1): veem e comentam como equipe, mas não atendem. */
  auxiliarIds: readonly number[]
}

/** Projeção que todo ponto de escopo carrega; converta o resultado com `comAuxiliarIds`. */
export const selectEscopo = {
  areaId: true,
  operadorId: true,
  solicitanteId: true,
  auxiliares: { select: { usuarioId: true } },
} satisfies Prisma.ChamadoSelect

/** Troca `auxiliares: [{ usuarioId }]` (Prisma) por `auxiliarIds: number[]` (o formato do `ChamadoEscopo`). */
export function comAuxiliarIds<T extends { auxiliares: ReadonlyArray<{ usuarioId: number }> }>(
  c: T,
): Omit<T, 'auxiliares'> & { auxiliarIds: number[] }
export function comAuxiliarIds<T extends { auxiliares: ReadonlyArray<{ usuarioId: number }> }>(
  c: T | null,
): (Omit<T, 'auxiliares'> & { auxiliarIds: number[] }) | null
export function comAuxiliarIds<T extends { auxiliares: ReadonlyArray<{ usuarioId: number }> }>(c: T | null) {
  if (c === null) return null
  const { auxiliares, ...resto } = c
  return { ...resto, auxiliarIds: auxiliares.map((a) => a.usuarioId) }
}

/** SEMPRE combinar com AND: [escopoChamados(u), filtros]. Nunca espalhar no mesmo objeto. */
export function escopoChamados(u: UsuarioSessao): Prisma.ChamadoWhereInput {
  if (temPermissao(u.perfil, 'chamado.verTodos')) return {}
  if (temPermissao(u.perfil, 'chamado.verArea')) {
    if (u.verTodasAreas === true) return {}
    return {
      OR: [
        { areaId: { in: u.areaIds } },
        { operadorId: u.id },
        { solicitanteId: u.id },
        { auxiliares: { some: { usuarioId: u.id } } },
      ],
    }
  }
  return { solicitanteId: u.id }
}

export function podeVerChamado(u: UsuarioSessao, c: ChamadoEscopo): boolean {
  if (temPermissao(u.perfil, 'chamado.verTodos')) return true
  if (c.solicitanteId === u.id) return true
  if (!temPermissao(u.perfil, 'chamado.verArea')) return false
  if (u.verTodasAreas === true) return true
  return u.areaIds.includes(c.areaId) || c.operadorId === u.id || c.auxiliarIds.includes(u.id)
}

/** Conteúdo interno nunca é visto pelo solicitante, qualquer que seja o perfil (corrige F10 da v1). */
export function podeVerInterno(u: UsuarioSessao, c: ChamadoEscopo): boolean {
  return temPermissao(u.perfil, 'chamado.verInterno') && c.solicitanteId !== u.id && podeVerChamado(u, c)
}

/** Atuar como atendente: operador da área do chamado, responsável atual ou admin (auxiliar não atende). Ignora `verTodasAreas` (T-13.2). */
export function podeAtender(u: UsuarioSessao, c: ChamadoEscopo): boolean {
  if (!temPermissao(u.perfil, 'chamado.atender')) return false
  return temPermissao(u.perfil, 'chamado.verTodos') || u.areaIds.includes(c.areaId) || c.operadorId === u.id
}

/** Estado do chamado de que `acoesDoUsuario` precisa, além do escopo. */
export type ChamadoParaAcoes = ChamadoEscopo & {
  statusTipo: TipoStatus
  papel: PapelStatus | null
  cancelado: boolean
  encerradoEm: Date | null
}

const DIA_MS = 24 * 60 * 60 * 1000
/** Tipos em que o atendimento está em curso (a tabela da §3.5: ABERTO, EM_ATENDIMENTO, PENDENTE). */
const EM_CURSO: readonly TipoStatus[] = ['ABERTO', 'EM_ATENDIMENTO', 'PENDENTE']

/**
 * Ações que o usuário pode fazer agora (colunas "Quem pode" e "Tipo do status atual" da §3.5). Serve de `acoes` do
 * detalhe e de pré-checagem; cada rota de ação confere de novo, nesta ordem: permissão, escopo, estado e versão (S47).
 */
export function acoesDoUsuario(u: UsuarioSessao, c: ChamadoParaAcoes, cfg: Config, agora: Date): ChamadoAcoes {
  const tipo = c.statusTipo
  const ehSolicitante = c.solicitanteId === u.id
  const atende = podeAtender(u, c)
  const encerrado = tipo === 'ENCERRADO'
  const concluidoOuEncerrado = tipo === 'CONCLUIDO' || encerrado
  const emCurso = EM_CURSO.includes(tipo)

  // comentar: quem vê o chamado; o solicitante não comenta depois de CONCLUIDO, a equipe só depois de ENCERRADO
  const comentar =
    podeVerChamado(u, c) &&
    temPermissao(u.perfil, 'chamado.comentar') &&
    (ehSolicitante ? !concluidoOuEncerrado : !encerrado)

  // reabrir: solicitante, último operador ou ADMIN, em ENCERRADO não cancelado, dentro do prazo configurado
  const prazoDias = cfg['chamado.prazoReaberturaDias']
  const dentroDoPrazo =
    prazoDias === 0 || (c.encerradoEm !== null && c.encerradoEm.getTime() + prazoDias * DIA_MS >= agora.getTime())
  const reabrir =
    encerrado &&
    !c.cancelado &&
    cfg['chamado.permitirReabertura'] &&
    dentroDoPrazo &&
    (ehSolicitante || c.operadorId === u.id || temPermissao(u.perfil, 'chamado.verTodos'))

  return {
    assumir: atende && emCurso,
    encaminhar: atende && emCurso,
    status: atende && emCurso,
    prioridade: atende && !concluidoOuEncerrado,
    classificar: atende && !encerrado,
    tags: atende,
    agendar: atende && (emCurso || tipo === 'AGENDADO'),
    concluir: atende && (emCurso || tipo === 'AGENDADO'),
    aprovar: ehSolicitante && tipo === 'CONCLUIDO',
    rejeitar: ehSolicitante && tipo === 'CONCLUIDO',
    reabrir,
    cancelar: (ehSolicitante && tipo === 'ABERTO' && c.operadorId === null) || (atende && !concluidoOuEncerrado),
    comentar,
    comentarInterno: comentar && podeVerInterno(u, c),
    anexar: comentar && temPermissao(u.perfil, 'anexo.enviar') && cfg['anexos.habilitados'],
  }
}
