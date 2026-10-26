import { TIPOS_INAPP_FIXOS, type TipoNotificacao } from '@vinimon/shared'

/**
 * Regras puras evento → notificação (§3.8). Sem banco.
 * Inativos, quem não vê o chamado, `podeVerInterno` e a restrição de TAGS_ALTERADAS à equipe
 * NÃO são tratados aqui: pertencem ao fanout com banco (T-6.8).
 * `ctx.operadoresDaArea` deve ser a lista da área atual do chamado (a nova área, em ENCAMINHADO).
 */
export type EventoNotificavel =
  | { tipo: 'CRIADO'; id: number; abertoEmNomeDeOutro: boolean }
  | { tipo: 'COMENTARIO'; id: number }
  | { tipo: 'ASSUMIDO'; id: number; operadorNovoId: number | null }
  | { tipo: 'ENCAMINHADO'; id: number; operadorNovoId: number | null }
  | { tipo: 'AUXILIAR_ADICIONADO'; id: number; auxiliarId: number }
  | { tipo: 'STATUS_ALTERADO' }
  | { tipo: 'AGENDADO' }
  | { tipo: 'RETORNO_AGENDAMENTO' }
  | { tipo: 'REABERTO' }
  | { tipo: 'CANCELADO' }
  | { tipo: 'CONCLUIDO'; encerrouDireto: boolean }
  | { tipo: 'APROVADO'; id: number }
  | { tipo: 'AUTO_APROVADO'; id: number }
  | { tipo: 'REJEITADO'; id: number }
  | { tipo: 'PRIORIDADE_ALTERADA' }
  | { tipo: 'CLASSIFICACAO_ALTERADA' }
  | { tipo: 'TAGS_ALTERADAS' }
  | { tipo: 'ANEXO_ADICIONADO' }
  | { tipo: 'SLA_RISCO'; id: number }
  | { tipo: 'SLA_ESTOURADO'; id: number }
  | { tipo: 'SLA_RESPOSTA_ESTOURADO'; id: number }

export type ContextoDestinatarios = {
  chamado: { id: number; solicitanteId: number; operadorId: number | null; areaId: number }
  seguidores: { usuarioId: number; silenciado: boolean }[]
  operadoresDaArea: number[]
  mencionados: number[]
  ator: number
}

export type Destinatario = { usuarioId: number; tipo: TipoNotificacao; grupoChave: string }

const ALTA_PRIORIDADE: readonly string[] = TIPOS_INAPP_FIXOS

export function destinatarios(evento: EventoNotificavel, ctx: ContextoDestinatarios): Destinatario[] {
  const escolhidos = new Map<number, Destinatario>()

  const adicionar = (usuarioId: number, tipo: TipoNotificacao, grupoChave: string) => {
    if (usuarioId === ctx.ator) return
    const atual = escolhidos.get(usuarioId)
    if (atual && !(ALTA_PRIORIDADE.includes(tipo) && !ALTA_PRIORIDADE.includes(atual.tipo))) return
    escolhidos.set(usuarioId, { usuarioId, tipo, grupoChave })
  }

  const idChamado = ctx.chamado.id
  const ativos = ctx.seguidores.filter((s) => !s.silenciado).map((s) => s.usuarioId)
  const silenciados = new Set(ctx.seguidores.filter((s) => s.silenciado).map((s) => s.usuarioId))
  const seguidoresPara = (tipo: TipoNotificacao, grupoChave: string) => {
    for (const usuarioId of ativos) adicionar(usuarioId, tipo, grupoChave)
  }
  const operadoresDaAreaPara = (tipo: TipoNotificacao, grupoChave: string) => {
    for (const usuarioId of ctx.operadoresDaArea) adicionar(usuarioId, tipo, grupoChave)
  }
  const atualizacao = `atualizacao:${idChamado}`
  const status = `status:${idChamado}`

  switch (evento.tipo) {
    case 'CRIADO':
      operadoresDaAreaPara('NOVO_NA_FILA', `novo:${evento.id}`)
      if (evento.abertoEmNomeDeOutro) adicionar(ctx.chamado.solicitanteId, 'ATUALIZACAO', atualizacao)
      break
    case 'COMENTARIO':
      for (const usuarioId of ctx.mencionados) adicionar(usuarioId, 'MENCAO', `mencao:${evento.id}`)
      for (const usuarioId of ativos) {
        if (!ctx.mencionados.includes(usuarioId)) adicionar(usuarioId, 'COMENTARIO', `comentario:${idChamado}`)
      }
      break
    case 'ASSUMIDO':
    case 'ENCAMINHADO':
      if (evento.operadorNovoId !== null) {
        adicionar(evento.operadorNovoId, 'ATRIBUIDO', `atribuido:${evento.id}`)
      } else {
        operadoresDaAreaPara('NOVO_NA_FILA', `novo:${evento.id}`)
      }
      seguidoresPara('ATUALIZACAO', atualizacao)
      break
    case 'AUXILIAR_ADICIONADO':
      adicionar(evento.auxiliarId, 'ATRIBUIDO', `atribuido:${evento.id}`)
      seguidoresPara('ATUALIZACAO', atualizacao)
      break
    case 'STATUS_ALTERADO':
    case 'AGENDADO':
    case 'RETORNO_AGENDAMENTO':
    case 'REABERTO':
    case 'CANCELADO':
      seguidoresPara('STATUS', status)
      break
    case 'CONCLUIDO':
      if (evento.encerrouDireto) {
        if (!silenciados.has(ctx.chamado.solicitanteId)) adicionar(ctx.chamado.solicitanteId, 'STATUS', status)
        seguidoresPara('STATUS', status)
      } else {
        adicionar(ctx.chamado.solicitanteId, 'AVALIACAO_PENDENTE', `avaliacao:${idChamado}`)
        seguidoresPara('STATUS', status)
      }
      break
    case 'APROVADO':
    case 'AUTO_APROVADO':
      if (ctx.chamado.operadorId !== null) {
        adicionar(ctx.chamado.operadorId, 'AVALIACAO_RECEBIDA', `avaliacao-recebida:${evento.id}`)
      }
      seguidoresPara('STATUS', status)
      break
    case 'REJEITADO':
      if (ctx.chamado.operadorId !== null) adicionar(ctx.chamado.operadorId, 'REJEITADO', `rejeitado:${evento.id}`)
      operadoresDaAreaPara('REJEITADO', `rejeitado:${evento.id}`)
      break
    case 'PRIORIDADE_ALTERADA':
    case 'CLASSIFICACAO_ALTERADA':
    case 'TAGS_ALTERADAS':
    case 'ANEXO_ADICIONADO':
      seguidoresPara('ATUALIZACAO', atualizacao)
      break
    case 'SLA_RISCO':
    case 'SLA_ESTOURADO':
    case 'SLA_RESPOSTA_ESTOURADO': {
      const grupo = `sla:${evento.id}`
      if (ctx.chamado.operadorId !== null) adicionar(ctx.chamado.operadorId, 'SLA', grupo)
      else operadoresDaAreaPara('SLA', grupo)
      break
    }
  }

  return [...escolhidos.values()]
}
