import type { MotivoSessaoEncerrada } from '@vinimon/shared'
import type { FastifyBaseLogger } from 'fastify'
import { podeVerChamado, podeVerInterno } from '../autorizacao/chamados'
import { obterConfig } from '../lib/config'
import { prisma } from '../lib/prisma'
import type { UsuarioSessao } from '../lib/sessao'
import type { PublicadorTempoReal } from '../lib/tempo-real'
import type { ServidorRt } from './plugin'
import { SALA_ADMINS, salaArea, salaChamado, salaChamadoInterno, salaSessao, salaUsuario } from './salas'

type SocketLocal = ServidorRt['sockets']['sockets'] extends Map<string, infer S> ? S : never

export type Revogacao = Pick<
  PublicadorTempoReal,
  'encerrarSessao' | 'encerrarSessoesDoUsuario' | 'revalidarUsuario' | 'revalidarChamado'
> & {
  /** O corpo do intervalo: confere os `sessaoId` dos sockets locais numa query e derruba os inválidos. */
  revalidarSessoes(agora?: Date): Promise<number>
  iniciar(intervaloMs: number): void
  parar(): void
}

const salaDeChamado = (sala: string): number | null => {
  const m = /^chamado:(\d+)$/.exec(sala)
  return m?.[1] ? Number(m[1]) : null
}

async function carregarUsuarios(ids: number[]) {
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: ids }, ativo: true },
    select: {
      id: true,
      nome: true,
      login: true,
      perfil: true,
      areaId: true,
      areasSecundarias: { select: { areaId: true } },
    },
  })
  return new Map(
    usuarios.map((u) => {
      const sec = u.areasSecundarias.map((a) => a.areaId)
      return [u.id, { ...u, areaIds: u.areaId === null ? sec : [u.areaId, ...sec] }] as const
    }),
  )
}

/**
 * Revogação e revalidação dos sockets (S20, S53, S94). Trabalha nos sockets locais (um processo só, §3.13): a
 * revogação derruba em menos de 1 s; a revalidação reavalia salas depois de mudar perfil, área, 2FA, encaminhar ou
 * classificar; o intervalo cobre o que escapou (expiração, inatividade, desativação).
 */
export function criarRevogacao(io: ServidorRt, log: FastifyBaseLogger): Revogacao {
  let timer: ReturnType<typeof setInterval> | null = null
  const locais = (): SocketLocal[] => [...io.sockets.sockets.values()]
  const seguro = (etapa: string, trabalho: () => Promise<void> | void) => {
    Promise.resolve()
      .then(trabalho)
      .catch((err: unknown) => log.error({ err, etapa }, 'falha na revalidação de sockets'))
  }

  const derrubar = (sockets: SocketLocal[], motivo: MotivoSessaoEncerrada) => {
    for (const s of sockets) {
      s.emit('sessao:encerrada', { motivo })
      s.disconnect(true)
    }
  }

  /** Ajusta as salas de um socket ao que o usuário (já recarregado) pode ver agora. */
  async function reavaliarSalas(sockets: SocketLocal[], usuarios: Map<number, UsuarioSessao>) {
    const idsChamado = new Set<number>()
    for (const s of sockets)
      for (const sala of s.rooms) {
        const id = salaDeChamado(sala)
        if (id !== null) idsChamado.add(id)
      }
    const chamados = new Map(
      (idsChamado.size === 0
        ? []
        : await prisma.chamado.findMany({
            where: { id: { in: [...idsChamado] } },
            select: { id: true, areaId: true, operadorId: true, solicitanteId: true },
          })
      ).map((c) => [c.id, c]),
    )
    for (const s of sockets) {
      const u = usuarios.get(s.data.usuario.id)
      if (!u) continue
      for (const sala of s.rooms) {
        const id = salaDeChamado(sala)
        if (id === null) continue
        const c = chamados.get(id)
        if (!c || !podeVerChamado(u, c)) {
          s.leave(salaChamado(id))
          s.leave(salaChamadoInterno(id))
          s.emit('chamado:acessoRevogado', { chamadoId: id })
        } else if (podeVerInterno(u, c)) s.join(salaChamadoInterno(id))
        else s.leave(salaChamadoInterno(id))
      }
    }
  }

  return {
    encerrarSessao(sessaoId, motivo) {
      // `sessao:encerrada` primeiro, depois a queda (§3.7)
      io.to(salaSessao(sessaoId)).emit('sessao:encerrada', { motivo })
      io.in(salaSessao(sessaoId)).disconnectSockets(true)
    },

    encerrarSessoesDoUsuario(usuarioId, motivo) {
      io.to(salaUsuario(usuarioId)).emit('sessao:encerrada', { motivo })
      io.in(salaUsuario(usuarioId)).disconnectSockets(true)
    },

    revalidarUsuario(usuarioId) {
      seguro('revalidar-usuario', async () => {
        const sockets = locais().filter((s) => s.data.usuario.id === usuarioId)
        if (sockets.length === 0) return
        const fresco = (await carregarUsuarios([usuarioId])).get(usuarioId)
        if (!fresco) return derrubar(sockets, 'usuario_desativado')
        const usuarios = new Map<number, UsuarioSessao>()
        for (const s of sockets) {
          const atual: UsuarioSessao = { ...s.data.usuario, ...fresco }
          s.data.usuario = atual
          usuarios.set(usuarioId, atual)
          for (const sala of s.rooms) if (sala.startsWith('area:') || sala === SALA_ADMINS) s.leave(sala)
          if (atual.perfil === 'OPERADOR') for (const areaId of atual.areaIds) s.join(salaArea(areaId))
          if (atual.perfil === 'ADMIN') s.join(SALA_ADMINS)
        }
        await reavaliarSalas(sockets, usuarios)
      })
    },

    revalidarChamado(chamadoId) {
      seguro('revalidar-chamado', async () => {
        const sockets = locais().filter(
          (s) => s.rooms.has(salaChamado(chamadoId)) || s.rooms.has(salaChamadoInterno(chamadoId)),
        )
        if (sockets.length === 0) return
        const c = await prisma.chamado.findUnique({
          where: { id: chamadoId },
          select: { areaId: true, operadorId: true, solicitanteId: true },
        })
        const frescos = await carregarUsuarios([...new Set(sockets.map((s) => s.data.usuario.id))])
        for (const s of sockets) {
          const base = frescos.get(s.data.usuario.id)
          const u = base ? { ...s.data.usuario, ...base } : null
          if (!c || !u || !podeVerChamado(u, c)) {
            s.leave(salaChamado(chamadoId))
            s.leave(salaChamadoInterno(chamadoId))
            s.emit('chamado:acessoRevogado', { chamadoId })
          } else if (podeVerInterno(u, c)) s.join(salaChamadoInterno(chamadoId))
          else s.leave(salaChamadoInterno(chamadoId))
        }
      })
    },

    async revalidarSessoes(agora = new Date()) {
      const sockets = locais()
      const ids = [...new Set(sockets.map((s) => s.data.usuario.sessaoId))]
      if (ids.length === 0) return 0
      const limiteMin = (await obterConfig())['sessao.minutosInatividade']
      const linhas = await prisma.sessao.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          estado: true,
          expiraEm: true,
          ultimoUsoEm: true,
          revogadaEm: true,
          usuario: { select: { ativo: true } },
        },
      })
      const porId = new Map(linhas.map((l) => [l.id, l]))
      let derrubados = 0
      for (const id of ids) {
        const l = porId.get(id)
        let motivo: MotivoSessaoEncerrada | null = null
        if (!l || l.revogadaEm !== null) motivo = 'revogada'
        else if (!l.usuario.ativo) motivo = 'usuario_desativado'
        else if (l.expiraEm.getTime() <= agora.getTime()) motivo = 'expirada'
        else if (agora.getTime() - l.ultimoUsoEm.getTime() > limiteMin * 60_000) motivo = 'expirada'
        if (motivo === null) continue
        const alvo = sockets.filter((s) => s.data.usuario.sessaoId === id)
        derrubados += alvo.length
        derrubar(alvo, motivo)
      }
      return derrubados
    },

    iniciar(intervaloMs) {
      if (timer) clearInterval(timer)
      timer = setInterval(() => {
        seguro('revalidar-sessoes', async () => {
          await this.revalidarSessoes()
        })
      }, intervaloMs)
      timer.unref()
    },

    parar() {
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}
