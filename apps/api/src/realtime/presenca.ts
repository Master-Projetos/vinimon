import {
  type EstadoPresenca,
  MAX_DIAS_PRESENCA_MANUAL,
  PresencaAssinarSchema,
  PresencaAtividadeSchema,
  type PresencaManual,
} from '@vinimon/shared'
import type { FastifyBaseLogger } from 'fastify'
import { requisicaoInvalida } from '../lib/erros'
import { prisma } from '../lib/prisma'
import type { UsuarioSessao } from '../lib/sessao'
import { consumir, limitesEventos, violacoes } from './limites'
import type { ServidorRt } from './plugin'
import { salaPresenca, salaUsuario } from './salas'

export interface ManualVigente {
  estado: PresencaManual
  ate: Date | null
}

/**
 * Estado de presença (§3.7), em ordem: sem conexão → OFFLINE; manual vigente → o manual; alguma conexão ativa →
 * DISPONIVEL; senão AUSENTE. O relógio entra por parâmetro.
 */
export function calcularEstado(
  conexoes: readonly { ativo: boolean }[],
  manual: ManualVigente | null,
  agora: Date,
): EstadoPresenca {
  if (conexoes.length === 0) return 'OFFLINE'
  if (manual && (manual.ate === null || manual.ate.getTime() > agora.getTime())) return manual.estado
  return conexoes.some((c) => c.ativo) ? 'DISPONIVEL' : 'AUSENTE'
}

/**
 * Privacidade (S97, T58): a equipe vê todos; o usuário comum vê só a equipe.
 */
export const podeVerPresenca = (
  observador: { perfil: UsuarioSessao['perfil'] },
  alvo: { perfil: UsuarioSessao['perfil'] },
) => observador.perfil !== 'USUARIO' || alvo.perfil !== 'USUARIO'

export interface PropriaPresenca {
  estado: EstadoPresenca
  manual: PresencaManual | null
  ate: Date | null
}

export interface SaidaPresenca {
  /** `presenca:mudou` para `presenca:<uid>`: só `{usuarioId, estado}`, sem horário nem IP. */
  mudou(usuarioId: number, estado: EstadoPresenca): void
  /** `presenca:propria` para `usuario:<id>`. */
  propria(usuarioId: number, p: PropriaPresenca): void
}

interface Entrada {
  conexoes: Map<string, boolean>
  manual: ManualVigente | null
  estado: EstadoPresenca
  ultimoRegistroMs: number
  timer: ReturnType<typeof setTimeout> | null
  pronto: Promise<void>
}

const CINCO_MIN_MS = 5 * 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000

export class PresencaService {
  private readonly entradas = new Map<number, Entrada>()

  private readonly saida: SaidaPresenca
  private readonly relogio: () => Date

  constructor(saida: SaidaPresenca, relogio: () => Date = () => new Date()) {
    this.saida = saida
    this.relogio = relogio
  }

  private manualVigente(m: ManualVigente | null): ManualVigente | null {
    return m && (m.ate === null || m.ate.getTime() > this.relogio().getTime()) ? m : null
  }

  private estadoDeEntrada(e: Entrada): EstadoPresenca {
    return calcularEstado(
      [...e.conexoes.values()].map((ativo) => ({ ativo })),
      e.manual,
      this.relogio(),
    )
  }

  /** Estado atual; sem conexão (ou usuário desconhecido) é OFFLINE. */
  estadoDe(usuarioId: number): EstadoPresenca {
    const e = this.entradas.get(usuarioId)
    return e ? this.estadoDeEntrada(e) : 'OFFLINE'
  }

  private propriaDe(e: Entrada): PropriaPresenca {
    const manual = this.manualVigente(e.manual)
    return { estado: this.estadoDeEntrada(e), manual: manual?.estado ?? null, ate: manual?.ate ?? null }
  }

  /** Reavalia o estado e emite se mudou (ou sempre `propria`, quando o manual mudou). */
  private reavaliar(usuarioId: number, e: Entrada, forcarPropria = false): void {
    const novo = this.estadoDeEntrada(e)
    const mudou = novo !== e.estado
    e.estado = novo
    if (mudou) this.saida.mudou(usuarioId, novo)
    if (mudou || forcarPropria) this.saida.propria(usuarioId, this.propriaDe(e))
  }

  private agendarExpiracao(usuarioId: number, e: Entrada): void {
    if (e.timer) clearTimeout(e.timer)
    e.timer = null
    const ate = e.manual?.ate
    if (!ate) return
    const espera = Math.max(0, ate.getTime() - this.relogio().getTime())
    e.timer = setTimeout(() => this.reavaliarDepoisDeExpirar(usuarioId), espera + 5)
    e.timer.unref()
  }

  /** Chamado pelo timer (e pelos testes, com o relógio injetado): o manual vencido volta ao automático. */
  reavaliarDepoisDeExpirar(usuarioId: number): void {
    const e = this.entradas.get(usuarioId)
    if (!e) return
    if (e.manual && !this.manualVigente(e.manual)) e.manual = null
    this.reavaliar(usuarioId, e, true)
  }

  async conectar(usuarioId: number, socketId: string): Promise<void> {
    let e = this.entradas.get(usuarioId)
    if (!e) {
      const nova: Entrada = {
        conexoes: new Map(),
        manual: null,
        estado: 'OFFLINE',
        ultimoRegistroMs: 0,
        timer: null,
        pronto: Promise.resolve(),
      }
      nova.pronto = prisma.presencaUsuario
        .findUnique({ where: { usuarioId }, select: { estadoManual: true, manualAte: true } })
        .then((p) => {
          nova.manual = this.manualVigente(p?.estadoManual ? { estado: p.estadoManual, ate: p.manualAte } : null)
          this.agendarExpiracao(usuarioId, nova)
        })
      this.entradas.set(usuarioId, nova)
      e = nova
    }
    e.conexoes.set(socketId, true) // começa ativo; o cliente avisa quando muda
    await e.pronto
    this.reavaliar(usuarioId, e, true)
  }

  async desconectar(usuarioId: number, socketId: string): Promise<void> {
    const e = this.entradas.get(usuarioId)
    if (!e) return
    e.conexoes.delete(socketId)
    if (e.conexoes.size > 0) return this.reavaliar(usuarioId, e)
    // última conexão: grava o último visto e some da memória
    if (e.timer) clearTimeout(e.timer)
    this.entradas.delete(usuarioId)
    e.estado = 'OFFLINE'
    this.saida.mudou(usuarioId, 'OFFLINE')
    await this.gravarUltimoVisto(usuarioId)
  }

  private async gravarUltimoVisto(usuarioId: number): Promise<void> {
    const agora = this.relogio()
    await prisma.presencaUsuario.upsert({
      where: { usuarioId },
      create: { usuarioId, ultimoVistoEm: agora },
      update: { ultimoVistoEm: agora },
    })
  }

  /** `presenca:atividade`: só age quando o valor da conexão muda; durante atividade grava `ultimoVistoEm` a cada 5 min. */
  async atividade(usuarioId: number, socketId: string, ativo: boolean): Promise<void> {
    const e = this.entradas.get(usuarioId)
    if (!e || !e.conexoes.has(socketId) || e.conexoes.get(socketId) === ativo) return
    e.conexoes.set(socketId, ativo)
    this.reavaliar(usuarioId, e)
    const agora = this.relogio().getTime()
    if (ativo && agora - e.ultimoRegistroMs >= CINCO_MIN_MS) {
      e.ultimoRegistroMs = agora
      await this.gravarUltimoVisto(usuarioId)
    }
  }

  /** `PUT /me/presenca`: `estado = null` volta ao automático. O prazo máximo é de 7 dias. */
  async definirManual(usuarioId: number, estado: PresencaManual | null, ate: Date | null): Promise<PropriaPresenca> {
    const agora = this.relogio()
    if (estado !== null && ate !== null) {
      if (ate.getTime() <= agora.getTime()) throw requisicaoInvalida('O prazo precisa estar no futuro.')
      if (ate.getTime() > agora.getTime() + MAX_DIAS_PRESENCA_MANUAL * DIA_MS)
        throw requisicaoInvalida(`O prazo pode ter no máximo ${MAX_DIAS_PRESENCA_MANUAL} dias.`)
    }
    await prisma.presencaUsuario.upsert({
      where: { usuarioId },
      create: { usuarioId, estadoManual: estado, manualAte: estado === null ? null : ate },
      update: { estadoManual: estado, manualAte: estado === null ? null : ate },
    })
    const manual: ManualVigente | null = estado === null ? null : { estado, ate }
    const e = this.entradas.get(usuarioId)
    if (!e) return { estado: 'OFFLINE', manual: manual?.estado ?? null, ate: manual?.ate ?? null }
    await e.pronto
    e.manual = manual
    this.agendarExpiracao(usuarioId, e)
    this.reavaliar(usuarioId, e, true)
    return this.propriaDe(e)
  }

  fechar(): void {
    for (const e of this.entradas.values()) if (e.timer) clearTimeout(e.timer)
    this.entradas.clear()
  }
}

let atual: PresencaService | null = null
export const presencaService = (): PresencaService | null => atual

/**
 * Liga a presença ao servidor: `connection`/`disconnect` alimentam o serviço, e `presenca:atividade` e
 * `presenca:assinar` passam por Zod, limites e `podeVerPresenca` (S95–S97, T58).
 */
export function registrarPresenca(io: ServidorRt, log: FastifyBaseLogger): PresencaService {
  const servico = new PresencaService({
    mudou: (usuarioId, estado) => {
      io.to(salaPresenca(usuarioId)).volatile.emit('presenca:mudou', { usuarioId, estado })
    },
    propria: (usuarioId, p) => {
      io.to(salaUsuario(usuarioId)).emit('presenca:propria', {
        estado: p.estado,
        manual: p.manual,
        ate: p.ate?.toISOString() ?? null,
      })
    },
  })
  atual = servico

  io.on('connection', (socket) => {
    const u = socket.data.usuario
    const seguro = (etapa: string, tarefa: Promise<void>) => {
      tarefa.catch((err: unknown) => log.error({ err, etapa }, 'falha na presença'))
    }
    seguro('conectar', servico.conectar(u.id, socket.id))
    socket.on('disconnect', () => seguro('desconectar', servico.desconectar(u.id, socket.id)))

    const violou = async () => {
      if (!(await consumir(violacoes, socket.id))) socket.disconnect(true)
    }

    socket.on('presenca:atividade', async (bruto: unknown) => {
      const dados = PresencaAtividadeSchema.safeParse(bruto)
      if (!dados.success) return violou()
      if (!(await consumir(limitesEventos['presenca:atividade'], socket.id))) return violou()
      seguro('atividade', servico.atividade(u.id, socket.id, dados.data.ativo))
    })

    socket.on('presenca:assinar', async (bruto: unknown, ack?: unknown) => {
      const resposta = typeof ack === 'function' ? (ack as (r: unknown) => void) : undefined
      const dados = PresencaAssinarSchema.safeParse(bruto)
      if (!dados.success) {
        await violou()
        return resposta?.({ ok: false, erro: 'INVALIDO' })
      }
      if (!(await consumir(limitesEventos['presenca:assinar'], socket.id))) {
        await violou()
        return resposta?.({ ok: false, erro: 'RATE_LIMIT' })
      }
      try {
        const equipe = u.perfil !== 'USUARIO'
        const alvos = await prisma.usuario.findMany({
          where: { id: { in: [...new Set(dados.data.usuarioIds)] }, ativo: true },
          select: { id: true, perfil: true, presenca: { select: { ultimoVistoEm: true } } },
        })
        const permitidos = alvos.filter((a) => podeVerPresenca(u, a))
        // substitui as assinaturas anteriores
        for (const sala of socket.rooms) if (sala.startsWith('presenca:')) await socket.leave(sala)
        for (const a of permitidos) await socket.join(salaPresenca(a.id))
        resposta?.({
          ok: true,
          presencas: permitidos.map((a) => ({
            usuarioId: a.id,
            estado: servico.estadoDe(a.id),
            // o horário do último visto só vai para a equipe (S97)
            ...(equipe && a.presenca?.ultimoVistoEm ? { ultimoVistoEm: a.presenca.ultimoVistoEm.toISOString() } : {}),
          })),
        })
      } catch (err) {
        log.error({ err }, 'falha ao assinar presença')
        resposta?.({ ok: false, erro: 'INDISPONIVEL' })
      }
    })
  })
  return servico
}
