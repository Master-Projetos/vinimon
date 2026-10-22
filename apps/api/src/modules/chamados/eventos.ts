import type { TipoEvento } from '@vinimon/shared'
import { paraJson } from '../../lib/auditoria'
import { prisma, type Tx } from '../../lib/prisma'
import { type CampoChamado, type MotivoFila, tempoReal } from '../../lib/tempo-real'

/** Retorno padrão das transações de ação: o que `aposCommitChamado` precisa para os efeitos pós-commit. */
export interface EfeitosChamado {
  eventoIds: number[]
  assentamentoIds: number[]
  campos: CampoChamado[]
  /** Encaminhar e classificar podem tirar o acesso de quem estava na sala (`revalidarChamado`). */
  acessoMudou: boolean
  fila: MotivoFila | null
}

/** Grava o `ChamadoEvento` na mesma transação da ação: histórico (C22), fonte do feed e outbox (`processadoEm`). */
export async function registrarEvento(
  tx: Tx,
  e: {
    chamadoId: number
    tipo: TipoEvento
    /** null = sistema ou job. */
    atorId: number | null
    assentamentoId?: number | null
    interno?: boolean
    dados?: Record<string, unknown>
  },
): Promise<number> {
  const evento = await tx.chamadoEvento.create({
    data: {
      chamadoId: e.chamadoId,
      tipo: e.tipo,
      atorId: e.atorId,
      assentamentoId: e.assentamentoId ?? null,
      interno: e.interno ?? false,
      dados: paraJson(e.dados ?? {}),
    },
    select: { id: true },
  })
  return evento.id
}

/** Comentário de sistema (público) que acompanha o evento. `texto` já vem em pt-BR; `dados` serve ao de/para da tela. */
export async function registrarSistema(
  tx: Tx,
  chamadoId: number,
  evento: TipoEvento,
  texto: string,
  dados?: Record<string, unknown>,
): Promise<number> {
  const a = await tx.assentamento.create({
    data: {
      chamadoId,
      autorId: null,
      tipo: 'SISTEMA',
      interno: false,
      texto,
      evento,
      ...(dados === undefined ? {} : { dados: paraJson(dados) }),
    },
    select: { id: true },
  })
  return a.id
}

/** Mesma forma do logger do Fastify (`req.log`) que importa aqui. */
export interface LogErro {
  error(obj: object, msg: string): void
}

const logPadrao: LogErro = {
  error: (obj, msg) => {
    console.error(JSON.stringify({ nivel: 'error', msg, ...obj }))
  },
}

/** Motivos que chegam a `fila:atualizada` (§3.7). */
const MOTIVOS_FILA: ReadonlySet<MotivoFila> = new Set(['criado', 'atribuido', 'status', 'encaminhado', 'prioridade'])

async function tentar(
  log: LogErro,
  etapa: string,
  chamadoId: number,
  passo: () => void | Promise<void>,
): Promise<void> {
  try {
    await passo()
  } catch (err) {
    log.error({ err, chamadoId, etapa }, 'falha ao emitir efeito pós-commit do chamado')
  }
}

/**
 * Efeitos depois do commit (§3.8, passos 1 a 3). Cada passo roda sozinho em try/catch: falha de socket nunca desfaz a
 * ação nem derruba os passos seguintes. O passo 4 (fanout de notificações) entra na T-6.8.
 *
 * Evento com `interno=true` só emite `chamado:atualizado` para a sala interna e nunca chama `emitirFila`
 * (S49, S93). `chamado:atualizado` não sai quando `campos` está vazio (comentário não invalida cache).
 */
export async function aposCommitChamado(p: EfeitosChamado & { chamadoId: number; log?: LogErro }): Promise<void> {
  const log = p.log ?? logPadrao
  let internos: boolean[] = []
  await tentar(log, 'eventos', p.chamadoId, async () => {
    if (p.eventoIds.length === 0) return
    const eventos = await prisma.chamadoEvento.findMany({
      where: { id: { in: p.eventoIds } },
      select: { interno: true },
    })
    internos = eventos.map((e) => e.interno)
  })
  const algumInterno = internos.some(Boolean)
  const todosInternos = internos.length > 0 && internos.every(Boolean)

  // 1. assentamentos (o servidor decide a sala pelo `interno` de cada um)
  await tentar(log, 'assentamentos', p.chamadoId, () => {
    if (p.assentamentoIds.length > 0) tempoReal.emitirAssentamentos(p.chamadoId, p.assentamentoIds)
  })

  // 2. chamado:atualizado e fila:atualizada
  await tentar(log, 'chamado-atualizado', p.chamadoId, () => {
    if (p.campos.length > 0) tempoReal.emitirChamadoAtualizado(p.chamadoId, p.campos, todosInternos)
  })
  await tentar(log, 'fila', p.chamadoId, () => {
    if (p.fila !== null && MOTIVOS_FILA.has(p.fila) && !algumInterno) tempoReal.emitirFila(p.chamadoId, p.fila)
  })

  // 3. quem perdeu o acesso sai das salas
  await tentar(log, 'revalidar', p.chamadoId, () => {
    if (p.acessoMudou) tempoReal.revalidarChamado(p.chamadoId)
  })
}
