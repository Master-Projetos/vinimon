import {
  type Assentamento,
  type ChamadoDigitando,
  ChamadoDigitandoSchema,
  ChamadoEntrarSchema,
  ChamadoSairSchema,
  NotificacaoDadosSchema,
  type NotificacaoDTO,
} from '@vinimon/shared'
import type { FastifyBaseLogger } from 'fastify'
import type { ZodType } from 'zod'
import { comAuxiliarIds, podeVerChamado, podeVerInterno, selectEscopo } from '../autorizacao/chamados'
import { prisma } from '../lib/prisma'
import type { UsuarioSessao } from '../lib/sessao'
import type { PublicadorTempoReal } from '../lib/tempo-real'
import { selectAssentamento } from '../modules/assentamentos/schemas'
import { whereNotificacoesVisiveis } from '../modules/notificacoes/service'
import { consumir, type EventoLimitado, limitePacotes, limitesEventos, violacoes } from './limites'
import type { ServidorRt } from './plugin'
import { SALA_ADMINS, salaArea, salaChamado, salaChamadoInterno, salaUsuario } from './salas'

const MAX_SALAS_CHAMADO = 20
type Ack = ((r: unknown) => void) | undefined

/** Carrega o usuário do banco (áreas e perfil de agora, não os do handshake). `null` se inativo. */
async function recarregarUsuario(id: number, base: UsuarioSessao): Promise<UsuarioSessao | null> {
  const u = await prisma.usuario.findFirst({
    where: { id, ativo: true },
    select: {
      id: true,
      nome: true,
      login: true,
      perfil: true,
      areaId: true,
      areasSecundarias: { select: { areaId: true } },
    },
  })
  if (!u) return null
  const secundarias = u.areasSecundarias.map((a) => a.areaId)
  return { ...base, ...u, areaIds: u.areaId === null ? secundarias : [u.areaId, ...secundarias] }
}

const idDaSala = (sala: string): { chamadoId: number; interna: boolean } | null => {
  const m = /^chamado:(\d+)(:interno)?$/.exec(sala)
  return m?.[1] ? { chamadoId: Number(m[1]), interna: m[2] !== undefined } : null
}

/**
 * Registra os eventos do cliente. Todo payload passa por Zod (inválido conta violação e devolve `INVALIDO`, S95),
 * por um limite por evento (S96) e pelo limite geral de pacotes; 20 violações em 60 s derrubam o socket.
 */
export function registrarHandlers(io: ServidorRt, log: FastifyBaseLogger): void {
  io.on('connection', (socket) => {
    const digitando = new Set<string>() // `${chamadoId}:${interno}` em que este socket está digitando

    const violou = async () => {
      if (!(await consumir(violacoes, socket.id))) socket.disconnect(true)
    }

    socket.use(async (_pacote, proximo) => {
      if (await consumir(limitePacotes, socket.id)) return proximo()
      socket.disconnect(true)
    })

    /** Valida, limita e chama o handler. `ack` ausente é tratado (cliente malicioso ou antigo). */
    const comValidacao =
      <T>(
        schema: ZodType<T>,
        limite: (dados: T | undefined) => { limiter: EventoLimitado; chave: string; silencioso?: boolean },
        handler: (dados: T, ack: Ack) => Promise<void>,
      ) =>
      async (bruto: unknown, ack?: unknown) => {
        const resposta: Ack = typeof ack === 'function' ? (ack as (r: unknown) => void) : undefined
        const dados = schema.safeParse(bruto)
        if (!dados.success) {
          await violou()
          resposta?.({ ok: false, erro: 'INVALIDO' })
          return
        }
        const l = limite(dados.data)
        if (!(await consumir(limitesEventos[l.limiter], l.chave))) {
          if (l.silencioso !== true) {
            await violou()
            resposta?.({ ok: false, erro: 'RATE_LIMIT' })
          }
          return
        }
        try {
          await handler(dados.data, resposta)
        } catch (err) {
          log.error({ err }, 'falha em handler de tempo real')
          resposta?.({ ok: false, erro: 'INDISPONIVEL' })
        }
      }

    socket.on(
      'chamado:entrar',
      comValidacao(
        ChamadoEntrarSchema,
        () => ({ limiter: 'chamado:entrar', chave: socket.id }),
        async ({ chamadoId }, ack) => {
          const u = await recarregarUsuario(socket.data.usuario.id, socket.data.usuario)
          const c = comAuxiliarIds(await prisma.chamado.findUnique({ where: { id: chamadoId }, select: selectEscopo }))
          // inexistente e sem acesso dão a mesma resposta (S92)
          if (!u || !c || !podeVerChamado(u, c)) return ack?.({ ok: false, erro: 'INDISPONIVEL' })
          const jaEstou = socket.rooms.has(salaChamado(chamadoId))
          const abertas = [...socket.rooms].filter((s) => /^chamado:\d+$/.test(s)).length
          if (!jaEstou && abertas >= MAX_SALAS_CHAMADO) return ack?.({ ok: false, erro: 'LIMITE_SALAS' })
          await socket.join(salaChamado(chamadoId))
          if (podeVerInterno(u, c)) await socket.join(salaChamadoInterno(chamadoId))
          else await socket.leave(salaChamadoInterno(chamadoId))
          ack?.({ ok: true })
        },
      ),
    )

    socket.on(
      'chamado:sair',
      comValidacao(
        ChamadoSairSchema,
        () => ({ limiter: 'chamado:sair', chave: socket.id }),
        async ({ chamadoId }) => {
          await socket.leave(salaChamado(chamadoId))
          await socket.leave(salaChamadoInterno(chamadoId))
        },
      ),
    )

    socket.on(
      'chamado:digitando',
      comValidacao(
        ChamadoDigitandoSchema,
        (d) =>
          d?.digitando
            ? { limiter: 'chamado:digitando:true', chave: `${socket.id}:${d.chamadoId}`, silencioso: true }
            : { limiter: 'chamado:digitando:false', chave: socket.id },
        async (d) => {
          const sala = d.interno ? salaChamadoInterno(d.chamadoId) : salaChamado(d.chamadoId)
          // exige a sala (e a interna, se `interno`): só o servidor coloca sockets em salas
          if (!socket.rooms.has(sala)) return
          const chave = `${d.chamadoId}:${d.interno}`
          if (d.digitando) digitando.add(chave)
          else digitando.delete(chave)
          const u = socket.data.usuario
          socket.to(sala).volatile.emit('chamado:digitando', {
            chamadoId: d.chamadoId,
            usuario: { id: u.id, nome: u.nome },
            interno: d.interno,
            digitando: d.digitando,
          })
        },
      ),
    )

    // ao sair, quem estava digitando "para de digitar" para os demais
    socket.on('disconnecting', () => {
      for (const sala of socket.rooms) {
        const r = idDaSala(sala)
        if (!r || !digitando.has(`${r.chamadoId}:${r.interna}`)) continue
        const u = socket.data.usuario
        const aviso: ChamadoDigitando & { usuario: { id: number; nome: string } } = {
          chamadoId: r.chamadoId,
          interno: r.interna,
          digitando: false,
          usuario: { id: u.id, nome: u.nome },
        }
        socket.to(sala).volatile.emit('chamado:digitando', aviso)
      }
    })
  })
}

function assentamentoParaDto(a: Awaited<ReturnType<typeof carregarAssentamentos>>[number]): Assentamento {
  const dados = a.dados !== null && typeof a.dados === 'object' && !Array.isArray(a.dados) ? a.dados : null
  return { ...a, dados: dados as Assentamento['dados'] }
}

function carregarAssentamentos(ids: readonly number[]) {
  return prisma.assentamento.findMany({
    where: { id: { in: [...ids] } },
    select: selectAssentamento,
    orderBy: { id: 'asc' },
  })
}

/** Não lidas por usuário numa query só, com o mesmo `where` do feed (S103). */
async function naoLidasPorUsuario(ids: number[]): Promise<Map<number, number>> {
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: ids } },
    select: { id: true, perfil: true, areaId: true, areasSecundarias: { select: { areaId: true } } },
  })
  const alvos = usuarios.map((u) => {
    const sec = u.areasSecundarias.map((a) => a.areaId)
    return { id: u.id, perfil: u.perfil, areaIds: u.areaId === null ? sec : [u.areaId, ...sec] }
  })
  if (alvos.length === 0) return new Map()
  const grupos = await prisma.notificacao.groupBy({
    by: ['usuarioId'],
    where: { AND: [{ lidaEm: null }, { OR: alvos.map(whereNotificacoesVisiveis) }] },
    _count: { _all: true },
  })
  return new Map(grupos.map((g) => [g.usuarioId, g._count._all]))
}

/**
 * Emissores reais do publicador (§3.7). Ficam de fora as quatro operações de revogação (`encerrarSessao`,
 * `encerrarSessoesDoUsuario`, `revalidarUsuario`, `revalidarChamado`), que entram na T-7.4.
 * Cada emissor é assíncrono por dentro e nunca lança: falha de socket só vai para o log.
 */
export function criarEmissores(
  io: ServidorRt,
  log: FastifyBaseLogger,
): Pick<
  PublicadorTempoReal,
  | 'emitirAssentamentos'
  | 'emitirChamadoAtualizado'
  | 'emitirFila'
  | 'emitirLeitura'
  | 'emitirNotificacoes'
  | 'emitirContagem'
> {
  const seguro = (etapa: string, trabalho: () => Promise<void> | void) => {
    Promise.resolve()
      .then(trabalho)
      .catch((err: unknown) => log.error({ err, etapa }, 'falha ao emitir evento de tempo real'))
  }

  return {
    emitirAssentamentos(chamadoId, ids) {
      seguro('assentamentos', async () => {
        for (const a of await carregarAssentamentos(ids)) {
          const sala = a.interno ? salaChamadoInterno(chamadoId) : salaChamado(chamadoId)
          io.to(sala).emit('assentamento:novo', { chamadoId, assentamento: assentamentoParaDto(a) })
        }
      })
    },

    emitirChamadoAtualizado(chamadoId, campos, apenasInterno) {
      seguro('chamado-atualizado', () => {
        const sala = apenasInterno ? salaChamadoInterno(chamadoId) : salaChamado(chamadoId)
        io.to(sala).emit('chamado:atualizado', { chamadoId, campos: [...campos] })
      })
    },

    emitirFila(chamadoId, motivo) {
      seguro('fila', async () => {
        const c = await prisma.chamado.findUnique({
          where: { id: chamadoId },
          select: { areaId: true, solicitanteId: true, operadorId: true, auxiliares: { select: { usuarioId: true } } },
        })
        if (!c) return
        const salas = [
          salaArea(c.areaId),
          SALA_ADMINS,
          salaUsuario(c.solicitanteId),
          ...(c.operadorId === null ? [] : [salaUsuario(c.operadorId)]),
          ...c.auxiliares.map((a) => salaUsuario(a.usuarioId)),
        ]
        io.to(salas).emit('fila:atualizada', { chamadoId, motivo })
      })
    },

    emitirLeitura(chamadoId, usuarioId, ultimoAssentamentoId, lidoEm) {
      seguro('leitura', async () => {
        const iso = lidoEm.toISOString()
        // a sala interna recebe o valor real
        io.to(salaChamadoInterno(chamadoId)).emit('chamado:leitura', {
          chamadoId,
          usuarioId,
          ultimoAssentamentoId,
          lidoEm: iso,
        })
        // os demais, o maior id público ≤ valor (S98): uma query
        const publico = await prisma.assentamento.aggregate({
          where: { chamadoId, interno: false, id: { lte: ultimoAssentamentoId } },
          _max: { id: true },
        })
        if (publico._max.id === null) return
        io.to(salaChamado(chamadoId)).except(salaChamadoInterno(chamadoId)).emit('chamado:leitura', {
          chamadoId,
          usuarioId,
          ultimoAssentamentoId: publico._max.id,
          lidoEm: iso,
        })
      })
    },

    emitirNotificacoes(itens) {
      seguro('notificacoes', async () => {
        if (itens.length === 0) return
        const linhas = await prisma.notificacao.findMany({
          where: { id: { in: itens.map((i) => i.notificacaoId) } },
          select: {
            id: true,
            usuarioId: true,
            tipo: true,
            contagem: true,
            interno: true,
            assentamentoId: true,
            atorIds: true,
            dados: true,
            criadoEm: true,
            atualizadoEm: true,
            lidaEm: true,
            chamado: { select: { id: true, assunto: true } },
          },
        })
        const idsAtores = [...new Set(linhas.flatMap((n) => n.atorIds))]
        const [atores, naoLidas] = await Promise.all([
          idsAtores.length === 0
            ? []
            : prisma.usuario.findMany({ where: { id: { in: idsAtores } }, select: { id: true, nome: true } }),
          naoLidasPorUsuario([...new Set(linhas.map((n) => n.usuarioId))]),
        ])
        const nomes = new Map(atores.map((a) => [a.id, a.nome]))
        for (const n of linhas) {
          const dados = NotificacaoDadosSchema.safeParse(n.dados)
          // sem o corpo da mensagem (S102, T61): o trecho só vem na leitura do feed
          const notificacao: NotificacaoDTO = {
            id: n.id,
            tipo: n.tipo,
            chamado: n.chamado,
            atores: n.atorIds.flatMap((id) => {
              const nome = nomes.get(id)
              return nome === undefined ? [] : [{ id, nome }]
            }),
            contagem: n.contagem,
            interno: n.interno,
            trecho: null,
            assentamentoId: n.assentamentoId,
            dados: dados.success ? dados.data : null,
            criadoEm: n.criadoEm,
            atualizadoEm: n.atualizadoEm,
            lida: n.lidaEm !== null,
          }
          io.to(salaUsuario(n.usuarioId)).emit('notificacao:nova', {
            notificacao,
            naoLidas: naoLidas.get(n.usuarioId) ?? 0,
          })
        }
      })
    },

    emitirContagem(usuarioId, naoLidas) {
      seguro('contagem', () => {
        io.to(salaUsuario(usuarioId)).emit('notificacao:contagem', { naoLidas })
      })
    },
  }
}
