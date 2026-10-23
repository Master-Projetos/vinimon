import {
  canalEmailPadrao,
  TIPOS_INAPP_FIXOS,
  type TipoEvento,
  type TipoNotificacao,
  temPermissao,
} from '@vinimon/shared'
import { podeVerChamado, podeVerInterno } from '../../autorizacao/chamados'
import { obterConfig } from '../../lib/config'
import { enfileirarEmail } from '../../lib/email'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'
import { tempoReal } from '../../lib/tempo-real'
import { chaveEmailNotificacao, despacharEmailNotificacao, textoEmailNotificacao } from './email-notificacao'
import { type ContextoDestinatarios, destinatarios, type EventoNotificavel } from './regras'
import { whereNotificacoesVisiveis } from './service'

interface EventoReclamado {
  id: number
  chamado_id: number
  tipo: TipoEvento
  ator_id: number | null
  assentamento_id: number | null
  interno: boolean
  dados: Record<string, unknown> | null
}

const MARCO_SLA = {
  SLA_RISCO: 'RISCO',
  SLA_ESTOURADO: 'ESTOURADO',
  SLA_RESPOSTA_ESTOURADO: 'RESPOSTA_ESTOURADO',
} as const

const numeros = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [])
const nomeDe = (v: unknown): string | undefined =>
  v !== null && typeof v === 'object' && 'nome' in v && typeof v.nome === 'string' ? v.nome : undefined
const idDe = (v: unknown): number | null =>
  v !== null && typeof v === 'object' && 'id' in v && typeof v.id === 'number' ? v.id : null

/** Traduz a linha do evento para o formato das regras puras (T-6.7). `null` = evento que não notifica. */
function eventoNotificavel(e: EventoReclamado): EventoNotificavel | null {
  const d = e.dados ?? {}
  switch (e.tipo) {
    case 'CRIADO':
      return { tipo: 'CRIADO', id: e.id, abertoEmNomeDeOutro: d.emNomeDeOutro === true }
    case 'COMENTARIO':
      return { tipo: 'COMENTARIO', id: e.id }
    case 'ASSUMIDO':
      return { tipo: 'ASSUMIDO', id: e.id, operadorNovoId: typeof d.para === 'number' ? d.para : null }
    case 'ENCAMINHADO':
      return { tipo: 'ENCAMINHADO', id: e.id, operadorNovoId: idDe(d.operador) }
    case 'CONCLUIDO':
      return { tipo: 'CONCLUIDO', encerrouDireto: d.direto === true }
    case 'APROVADO':
    case 'AUTO_APROVADO':
    case 'REJEITADO':
    case 'SLA_RISCO':
    case 'SLA_ESTOURADO':
    case 'SLA_RESPOSTA_ESTOURADO':
      return { tipo: e.tipo, id: e.id }
    case 'STATUS_ALTERADO':
    case 'AGENDADO':
    case 'RETORNO_AGENDAMENTO':
    case 'REABERTO':
    case 'CANCELADO':
    case 'PRIORIDADE_ALTERADA':
    case 'CLASSIFICACAO_ALTERADA':
    case 'TAGS_ALTERADAS':
    case 'ANEXO_ADICIONADO':
      return { tipo: e.tipo }
    default:
      return null
  }
}

/** Só rótulos de sistema (S102): nunca texto de usuário. */
function dadosDaNotificacao(e: EventoReclamado, areaNome: string, statusNome: string): Record<string, string> {
  if (e.tipo === 'STATUS_ALTERADO') {
    const nome = nomeDe((e.dados ?? {}).para)
    return nome === undefined ? {} : { statusNome: nome }
  }
  if (e.tipo === 'CRIADO' || e.tipo === 'ENCAMINHADO') return { areaNome }
  if (e.tipo === 'SLA_RISCO' || e.tipo === 'SLA_ESTOURADO' || e.tipo === 'SLA_RESPOSTA_ESTOURADO')
    return { marco: MARCO_SLA[e.tipo] }
  if (e.tipo === 'CONCLUIDO' || e.tipo === 'REABERTO' || e.tipo === 'CANCELADO' || e.tipo === 'AGENDADO')
    return { statusNome }
  return {}
}

/** Nomes de área e status só quando o tipo de evento os mostra (uma query a mais, e só nesses casos). */
async function rotulosDe(
  tx: Pick<typeof prisma, 'area' | 'status'>,
  ev: EventoReclamado,
  c: { areaId: number; statusId: number },
): Promise<{ areaNome: string; statusNome: string }> {
  const comArea = ev.tipo === 'CRIADO' || ev.tipo === 'ENCAMINHADO'
  const comStatus = ['CONCLUIDO', 'REABERTO', 'CANCELADO', 'AGENDADO'].includes(ev.tipo)
  const [area, status] = await Promise.all([
    comArea ? tx.area.findUnique({ where: { id: c.areaId }, select: { nome: true } }) : null,
    comStatus ? tx.status.findUnique({ where: { id: c.statusId }, select: { nome: true } }) : null,
  ])
  return { areaNome: area?.nome ?? '', statusNome: status?.nome ?? '' }
}

const EH_FIXO = (tipo: TipoNotificacao) => (TIPOS_INAPP_FIXOS as readonly string[]).includes(tipo)

/**
 * Fanout (§3.8): transforma um `ChamadoEvento` em notificações, com número fixo de queries (independe de quantos
 * seguidores existem). Tudo numa transação: o claim (`processado_em`) só vale se o upsert também valer, e uma
 * segunda chamada concorrente espera o lock da linha, enxerga `processado_em` preenchido e não faz nada.
 * Depois do commit: 1 `groupBy` de não lidas e a emissão (`emitirNotificacoes` + `emitirContagem`).
 * Devolve os ids das notificações criadas ou atualizadas.
 */
export async function processarEvento(eventoId: number): Promise<number[]> {
  const resultado = await prisma.$transaction(async (tx) => {
    // 1. claim
    const [ev] = await tx.$queryRaw<EventoReclamado[]>`
      UPDATE chamado_eventos SET processado_em = now()
      WHERE id = ${eventoId} AND processado_em IS NULL
      RETURNING id, chamado_id, tipo::text AS tipo, ator_id, assentamento_id, interno, dados`
    if (!ev) return null
    const regra = eventoNotificavel(ev)
    if (!regra) return null

    // 2. chamado
    const c = await tx.chamado.findUnique({
      where: { id: ev.chamado_id },
      select: {
        id: true,
        solicitanteId: true,
        operadorId: true,
        areaId: true,
        statusId: true,
      },
    })
    if (!c) return null

    // 3. seguidores (os mencionados vêm do próprio evento)
    const seguidores = await tx.chamadoSeguidor.findMany({
      where: { chamadoId: c.id },
      select: { usuarioId: true, silenciadoEm: true },
    })
    const mencionados = numeros((ev.dados ?? {}).mencionados)

    // 4. candidatos com áreas: seguidores, solicitante, responsável, mencionados e operadores da área
    const ids = [
      ...new Set([
        c.solicitanteId,
        ...(c.operadorId === null ? [] : [c.operadorId]),
        ...seguidores.map((s) => s.usuarioId),
        ...mencionados,
      ]),
    ]
    const candidatos = await tx.usuario.findMany({
      where: {
        ativo: true,
        OR: [
          { id: { in: ids } },
          { perfil: 'OPERADOR', OR: [{ areaId: c.areaId }, { areasSecundarias: { some: { areaId: c.areaId } } }] },
        ],
      },
      select: {
        id: true,
        nome: true,
        login: true,
        email: true,
        perfil: true,
        areaId: true,
        areasSecundarias: { select: { areaId: true } },
      },
    })
    const sessoes = new Map<number, UsuarioSessao>(
      candidatos.map((x) => {
        const secundarias = x.areasSecundarias.map((a) => a.areaId)
        return [
          x.id,
          {
            id: x.id,
            nome: x.nome,
            login: x.login,
            perfil: x.perfil,
            areaId: x.areaId,
            areaIds: x.areaId === null ? secundarias : [x.areaId, ...secundarias],
            sessaoId: '',
            estado: 'ATIVA',
            mfaAtivo: false,
          },
        ]
      }),
    )
    const operadoresDaArea = candidatos
      .filter((x) => x.perfil === 'OPERADOR' && sessoes.get(x.id)?.areaIds.includes(c.areaId))
      .map((x) => x.id)

    const contexto: ContextoDestinatarios = {
      chamado: { id: c.id, solicitanteId: c.solicitanteId, operadorId: c.operadorId, areaId: c.areaId },
      seguidores: seguidores.map((s) => ({ usuarioId: s.usuarioId, silenciado: s.silenciadoEm !== null })),
      operadoresDaArea,
      mencionados,
      ator: ev.ator_id ?? -1,
    }
    // inativos (fora de `candidatos`), quem não vê o chamado e, em evento interno, quem não vê o interno
    const escopo = { areaId: c.areaId, operadorId: c.operadorId, solicitanteId: c.solicitanteId }
    const alvos = destinatarios(regra, contexto).filter((d) => {
      const u = sessoes.get(d.usuarioId)
      if (!u || !podeVerChamado(u, escopo)) return false
      if (ev.interno && !podeVerInterno(u, escopo)) return false
      if (ev.tipo === 'TAGS_ALTERADAS' && !temPermissao(u.perfil, 'chamado.atender')) return false
      return true
    })
    if (alvos.length === 0) return null

    // 5. preferências (só as diferenças do padrão estão no banco; os tipos fixos ignoram)
    const preferencias = await tx.preferenciaNotificacao.findMany({
      where: { usuarioId: { in: alvos.map((a) => a.usuarioId) } },
      select: { usuarioId: true, tipo: true, inApp: true, email: true },
    })
    const desligadas = new Set(preferencias.filter((p) => !p.inApp).map((p) => `${p.usuarioId}:${p.tipo}`))
    const canaisEmail = new Map(
      preferencias.flatMap((p) => (p.email === null ? [] : [[`${p.usuarioId}:${p.tipo}`, p.email] as const])),
    )
    const finais = alvos.filter((a) => EH_FIXO(a.tipo) || !desligadas.has(`${a.usuarioId}:${a.tipo}`))
    if (finais.length === 0) return null

    // 6. upsert agrupado
    const us = finais.map((a) => a.usuarioId)
    const tipos = finais.map((a) => a.tipo)
    const chaves = finais.map((a) => a.grupoChave)
    const atores = ev.ator_id === null ? [] : [ev.ator_id]
    const rotulos = await rotulosDe(tx, ev, c)
    const rotulosDados = dadosDaNotificacao(ev, rotulos.areaNome, rotulos.statusNome)
    const dados = JSON.stringify(rotulosDados)
    const linhas = await tx.$queryRaw<Array<{ id: number; usuario_id: number; tipo: string; atualizado_em: Date }>>`
      INSERT INTO notificacoes (usuario_id, chamado_id, tipo, grupo_chave, evento_id, assentamento_id, ator_ids, interno, dados)
      SELECT d.u, ${c.id}, d.t::tipo_notificacao, d.k, ${ev.id}, ${ev.assentamento_id}, ${atores}::int[], ${ev.interno}, ${dados}::jsonb
      FROM unnest(${us}::int[], ${tipos}::text[], ${chaves}::text[]) AS d(u, t, k)
      ON CONFLICT (usuario_id, grupo_chave) DO UPDATE SET
        contagem = notificacoes.contagem + 1,
        evento_id = EXCLUDED.evento_id,
        dados = EXCLUDED.dados,
        interno = notificacoes.interno OR EXCLUDED.interno,
        atualizado_em = now(),
        lida_em = NULL,
        ator_ids = CASE WHEN EXCLUDED.ator_ids[1] = ANY(notificacoes.ator_ids)
          THEN notificacoes.ator_ids
          ELSE (EXCLUDED.ator_ids || notificacoes.ator_ids)[1:10] END
      RETURNING id, usuario_id, tipo::text AS tipo, atualizado_em`

    // 7. e-mail IMEDIATO (§5.6/§5.7): outbox na mesma transação; o envio sai depois do commit. Nunca para o solicitante
    // em evento interno, e só com `email.habilitado`.
    const emails: number[] = []
    if ((await obterConfig())['email.habilitado']) {
      const emailDe = new Map(candidatos.map((x) => [x.id, x.email]))
      for (const l of linhas) {
        const tipo = l.tipo as TipoNotificacao
        const usuario = sessoes.get(l.usuario_id)
        const para = emailDe.get(l.usuario_id) ?? null
        if (!usuario || para === null) continue
        if (ev.interno && l.usuario_id === c.solicitanteId) continue
        const canal = canaisEmail.get(`${l.usuario_id}:${tipo}`) ?? canalEmailPadrao(tipo, usuario.perfil)
        if (canal !== 'IMEDIATO') continue
        emails.push(
          await enfileirarEmail(tx, {
            para,
            assunto: `Vinimon: chamado #${c.id}`,
            texto: textoEmailNotificacao(tipo, ev.interno, c.id, rotulosDados),
            evento: ev.tipo,
            chamadoId: c.id,
            usuarioId: l.usuario_id,
            chaveIdempotencia: chaveEmailNotificacao(l.id, l.atualizado_em),
          }),
        )
      }
    }
    return { linhas, usuarios: [...new Set(us)].flatMap((id) => sessoes.get(id) ?? []), emails }
  })
  if (!resultado) return []

  // depois do commit: envio agendado (60 s). Se falhar aqui, o e-mail fica PENDENTE e `email-varrer` o reenfileira.
  for (const emailId of resultado.emails) {
    try {
      await despacharEmailNotificacao(emailId)
    } catch {
      // falha de fila nunca desfaz o fanout
    }
  }

  // depois do commit: contagem de não lidas por destinatário (uma query) e emissão
  const destinatariosIds = [...new Set(resultado.linhas.map((l) => l.usuario_id))]
  // o mesmo `where` do feed (S103, T60): só conta o que o destinatário ainda pode ver
  const grupos = await prisma.notificacao.groupBy({
    by: ['usuarioId'],
    where: { AND: [{ lidaEm: null }, { OR: resultado.usuarios.map(whereNotificacoesVisiveis) }] },
    _count: { _all: true },
  })
  const naoLidas = new Map(grupos.map((g) => [g.usuarioId, g._count._all]))
  try {
    tempoReal.emitirNotificacoes(resultado.linhas.map((l) => ({ usuarioId: l.usuario_id, notificacaoId: l.id })))
    for (const usuarioId of destinatariosIds) tempoReal.emitirContagem(usuarioId, naoLidas.get(usuarioId) ?? 0)
  } catch {
    // falha de socket nunca desfaz o fanout
  }
  return resultado.linhas.map((l) => l.id)
}
