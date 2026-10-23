import type { EventosCliente, EventosServidor } from '@vinimon/shared'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { Server } from 'socket.io'
import { carregarSessao, NOME_COOKIE, type UsuarioSessao } from '../lib/sessao'
import { definirTempoReal, type PublicadorTempoReal } from '../lib/tempo-real'
import { criarEmissores, registrarHandlers } from './handlers'
import { erroRt, permitirHandshake, temCredencialIndevida } from './handshake'
import { registrarPresenca } from './presenca'
import { SALA_ADMINS, salaArea, salaSessao, salaUsuario } from './salas'

export interface DadosSocket {
  usuario: UsuarioSessao
}

export type ServidorRt = Server<EventosCliente, EventosServidor, Record<string, never>, DadosSocket>

declare module 'fastify' {
  interface FastifyInstance {
    io: ServidorRt
  }
}

const MAX_SOCKETS_POR_USUARIO = 10

/** Revogação e revalidação (T-7.4) ainda sem efeito; as emissões reais vêm de `criarEmissores` (T-7.3). */
const publicador: PublicadorTempoReal = {
  encerrarSessao: () => undefined,
  encerrarSessoesDoUsuario: () => undefined,
  revalidarUsuario: () => undefined,
  revalidarChamado: () => undefined,
  emitirAssentamentos: () => undefined,
  emitirChamadoAtualizado: () => undefined,
  emitirFila: () => undefined,
  emitirLeitura: () => undefined,
  emitirNotificacoes: () => undefined,
  emitirContagem: () => undefined,
}

export const tempoRealPlugin = fp(
  async (app: FastifyInstance) => {
    const io: ServidorRt = new Server(app.server, {
      path: '/socket.io',
      serveClient: false,
      transports: ['websocket'],
      maxHttpBufferSize: 16_384,
      pingInterval: 25_000,
      pingTimeout: 20_000,
      allowRequest: (req, retorno) => {
        permitirHandshake(req).then(
          (ok) => retorno(null, ok),
          () => retorno(null, false),
        )
      },
    })
    app.decorate('io', io)

    io.use(async (socket, proximo) => {
      try {
        if (temCredencialIndevida(socket.request, socket.handshake.auth)) return proximo(erroRt('NAO_AUTENTICADO'))
        const cookies = app.parseCookie(socket.handshake.headers.cookie ?? '')
        const usuario = await carregarSessao(cookies[NOME_COOKIE], { tocar: false }) // heartbeat não estende a sessão
        if (!usuario || usuario.estado !== 'ATIVA') return proximo(erroRt('NAO_AUTENTICADO'))
        if ((io.of('/').adapter.rooms.get(salaUsuario(usuario.id))?.size ?? 0) >= MAX_SOCKETS_POR_USUARIO)
          return proximo(erroRt('LIMITE_CONEXOES'))
        socket.data.usuario = usuario
        proximo()
      } catch (err) {
        app.log.error({ err }, 'falha no handshake do socket')
        proximo(erroRt('ERRO_INTERNO'))
      }
    })

    io.on('connection', (socket) => {
      const u = socket.data.usuario
      socket.join(salaUsuario(u.id))
      socket.join(salaSessao(u.sessaoId))
      if (u.perfil === 'OPERADOR') for (const areaId of u.areaIds) socket.join(salaArea(areaId))
      if (u.perfil === 'ADMIN') socket.join(SALA_ADMINS)
    })

    registrarHandlers(io, app.log)
    const presenca = registrarPresenca(io, app.log)
    definirTempoReal({ ...publicador, ...criarEmissores(io, app.log) })

    app.addHook('onClose', async () => presenca.fechar())
    app.addHook('preClose', async () => {
      io.local.disconnectSockets(true)
    })
    app.addHook('onClose', async () => {
      // O Fastify já fechou o servidor HTTP: o erro "server not running" do close() é esperado.
      await io.close().catch(() => undefined)
    })
  },
  { name: 'tempo-real' },
)
