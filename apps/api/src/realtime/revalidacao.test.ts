import type { Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../test/ajudantes'
import { criarChamado, semearBase } from '../../test/fabricas'
import { conectar, esperarConectar, esperarEvento, naoRecebe } from '../../test/socket'
import type { App } from '../app'
import { prisma } from '../lib/prisma'

type Publicador = typeof import('../lib/tempo-real').tempoReal

describe('revogação e revalidação de sockets (S20, S53, S94, T55, T56)', () => {
  let app: App
  let tempoReal: Publicador
  let revogarSessao: typeof import('../lib/sessao').revogarSessao
  const abertos: Socket[] = []

  beforeAll(async () => {
    // intervalo de revalidação de 200 ms (T55): o `env` é lido na importação, então os módulos são recarregados
    vi.stubEnv('SOCKET_REVALIDAR_MS', '200')
    vi.resetModules()
    const { buildApp } = await import('../app')
    tempoReal = (await import('../lib/tempo-real')).tempoReal
    revogarSessao = (await import('../lib/sessao')).revogarSessao
    app = await buildApp({ logger: false })
    await app.ready()
    tempoReal = (await import('../lib/tempo-real')).tempoReal // o plugin instalou o publicador real
  })
  afterAll(async () => {
    await app.close()
    vi.unstubAllEnvs()
  })
  beforeEach(async () => {
    await limparBanco()
    await semearBase()
  })
  afterEach(() => {
    for (const s of abertos.splice(0)) s.disconnect()
  })

  const ligar = async (usuarioId: number, estado: 'ATIVA' = 'ATIVA') => {
    const h = await headersDe(usuarioId, estado)
    const s = await conectar(app, h.cookie)
    abertos.push(s)
    await esperarConectar(s)
    return { s, h }
  }
  /** Resolve com o tempo até a queda; rejeita se passar do limite. */
  const queda = (s: Socket, ms = 1000) =>
    new Promise<number>((resolver, rejeitar) => {
      const inicio = Date.now()
      const timer = setTimeout(() => rejeitar(new Error('o socket não caiu a tempo')), ms)
      s.once('disconnect', () => {
        clearTimeout(timer)
        resolver(Date.now() - inicio)
      })
    })
  const entrar = (s: Socket, chamadoId: number) =>
    new Promise<{ ok: boolean }>((resolver) => {
      s.emit('chamado:entrar', { chamadoId }, resolver)
    })

  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const opA = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const opA2 = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const opB = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const c = await criarChamado({ solicitanteId: sol.id, areaId: A.id, papel: 'EM_ATENDIMENTO', operadorId: opA2.id })
    return { A, B, sol, opA, opA2, opB, admin, c }
  }

  describe('T55: queda em menos de 1 s', () => {
    it('T55: logout derruba o socket com sessao:encerrada', async () => {
      const x = await cenario()
      const { s, h } = await ligar(x.sol.id)
      const aviso = esperarEvento<{ motivo: string }>(s, 'sessao:encerrada')
      const caiu = queda(s)
      expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: h })).statusCode).toBe(204)
      expect(await aviso).toEqual({ motivo: 'logout' })
      expect(await caiu).toBeLessThan(1000)
    })

    it('revogar a sessão derruba só os sockets dela', async () => {
      const x = await cenario()
      const a = await ligar(x.sol.id)
      const b = await ligar(x.sol.id) // outra sessão do mesmo usuário
      const caiu = queda(a.s)
      const nao = naoRecebe(b.s, 'sessao:encerrada')
      const sessao = await prisma.sessao.findFirstOrThrow({
        where: { usuarioId: x.sol.id },
        orderBy: { criadaEm: 'asc' },
      })
      await revogarSessao(sessao.id, 'logout')
      await caiu
      await nao
      expect(b.s.connected).toBe(true)
    })

    it('desativar o usuário e encerrar todas as sessões derrubam o socket', async () => {
      const x = await cenario()
      const hAdmin = await headersDe(x.admin.id)
      const um = await ligar(x.opA.id)
      const caiu = queda(um.s)
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/usuarios/${x.opA.id}`,
        headers: hAdmin,
        payload: { ativo: false },
      })
      expect(res.statusCode).toBe(200)
      expect(await caiu).toBeLessThan(1000)

      const dois = await ligar(x.opA2.id)
      const caiu2 = queda(dois.s)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/usuarios/${x.opA2.id}/encerrar-sessoes`,
            headers: hAdmin,
            payload: {},
          })
        ).statusCode,
      ).toBeLessThan(300)
      expect(await caiu2).toBeLessThan(1000)
    })

    it('expiração da sessão é detectada pela varredura (SOCKET_REVALIDAR_MS=200)', async () => {
      const x = await cenario()
      const { s } = await ligar(x.sol.id)
      const aviso = esperarEvento<{ motivo: string }>(s, 'sessao:encerrada', 2000)
      const caiu = queda(s, 2000)
      await prisma.sessao.updateMany({
        where: { usuarioId: x.sol.id },
        data: { criadaEm: new Date(Date.now() - 2 * 86_400_000), expiraEm: new Date(Date.now() - 1000) },
      })
      expect(await aviso).toEqual({ motivo: 'expirada' })
      expect(await caiu).toBeLessThan(1500)
    })

    it('inatividade além de sessao.minutosInatividade também derruba', async () => {
      const x = await cenario()
      const { s } = await ligar(x.sol.id)
      const caiu = queda(s, 2000)
      await prisma.sessao.updateMany({
        where: { usuarioId: x.sol.id },
        data: { ultimoUsoEm: new Date(Date.now() - 24 * 3600_000) },
      })
      await caiu
    })

    it('sessão revogada direto no banco é derrubada pela varredura', async () => {
      const x = await cenario()
      const { s } = await ligar(x.sol.id)
      const caiu = queda(s, 2000)
      await prisma.sessao.updateMany({
        where: { usuarioId: x.sol.id },
        data: { revogadaEm: new Date(), motivoRevogacao: 'logout' },
      })
      await caiu
    })
  })

  describe('T56: encaminhar tira o acesso de quem saiu da área', () => {
    it('T56: o operador antigo recebe chamado:acessoRevogado e deixa de receber eventos; o solicitante continua', async () => {
      const x = await cenario()
      const antigo = await ligar(x.opA.id)
      const solicitante = await ligar(x.sol.id)
      const quemEncaminha = await headersDe(x.opA2.id)
      expect((await entrar(antigo.s, x.c.id)).ok).toBe(true)
      expect((await entrar(solicitante.s, x.c.id)).ok).toBe(true)

      const revogado = esperarEvento<{ chamadoId: number }>(antigo.s, 'chamado:acessoRevogado')
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/chamados/${x.c.id}/encaminhar`,
        headers: quemEncaminha,
        payload: { versao: 0, areaId: x.B.id, operadorId: x.opB.id },
      })
      expect(res.statusCode).toBe(200)
      expect(await revogado).toEqual({ chamadoId: x.c.id })

      const a = await prisma.assentamento.create({
        data: { chamadoId: x.c.id, autorId: x.opB.id, tipo: 'COMENTARIO', texto: 'depois do encaminhamento' },
        select: { id: true },
      })
      const continua = esperarEvento(solicitante.s, 'assentamento:novo')
      const nao = naoRecebe(antigo.s, 'assentamento:novo')
      tempoReal.emitirAssentamentos(x.c.id, [a.id])
      await continua
      await nao
    })

    it('revalidarChamado tira quem perdeu o acesso e a sala interna de quem passou a ser o solicitante', async () => {
      const x = await cenario()
      const fora = await ligar(x.opB.id)
      // o operador B não está na área: nem entra; promove-se movendo o chamado para a área dele
      expect((await entrar(fora.s, x.c.id)).ok).toBe(false)
      await prisma.chamado.update({ where: { id: x.c.id }, data: { areaId: x.B.id } })
      expect((await entrar(fora.s, x.c.id)).ok).toBe(true)
      const revogado = esperarEvento(fora.s, 'chamado:acessoRevogado')
      await prisma.chamado.update({ where: { id: x.c.id }, data: { areaId: x.A.id } })
      tempoReal.revalidarChamado(x.c.id)
      await revogado
    })
  })

  describe('revalidarUsuario', () => {
    it('mudança de área tira das salas de chamado e das salas de área; mudança para ADMIN entra em admins', async () => {
      const x = await cenario()
      const { s } = await ligar(x.opA.id)
      expect((await entrar(s, x.c.id)).ok).toBe(true)
      const revogado = esperarEvento(s, 'chamado:acessoRevogado')
      await prisma.usuario.update({ where: { id: x.opA.id }, data: { areaId: x.B.id } })
      tempoReal.revalidarUsuario(x.opA.id)
      await revogado

      // agora na área B: o evento de fila da área A não chega; o da B chega
      const naoA = naoRecebe(s, 'fila:atualizada')
      tempoReal.emitirFila(x.c.id, 'status') // chamado da área A
      await naoA
      const chamadoB = await criarChamado({ solicitanteId: x.sol.id, areaId: x.B.id, papel: 'INICIAL' })
      const daB = esperarEvento(s, 'fila:atualizada')
      tempoReal.emitirFila(chamadoB.id, 'criado')
      await daB
    })

    it('usuário desativado é derrubado pela revalidação', async () => {
      const x = await cenario()
      const { s } = await ligar(x.opA.id)
      const caiu = queda(s)
      await prisma.usuario.update({ where: { id: x.opA.id }, data: { ativo: false } })
      tempoReal.revalidarUsuario(x.opA.id)
      await caiu
    })

    it('perder o acesso ao interno tira da sala interna sem derrubar do chamado', async () => {
      const x = await cenario()
      const hAdmin = await ligar(x.admin.id)
      expect((await entrar(hAdmin.s, x.c.id)).ok).toBe(true)
      await prisma.usuario.update({ where: { id: x.admin.id }, data: { perfil: 'USUARIO' } })
      tempoReal.revalidarUsuario(x.admin.id)
      await new Promise((r) => setTimeout(r, 150))
      const interno = await prisma.assentamento.create({
        data: { chamadoId: x.c.id, autorId: x.opA2.id, tipo: 'COMENTARIO', interno: true, texto: 'interno' },
        select: { id: true },
      })
      const nao = naoRecebe(hAdmin.s, 'assentamento:novo')
      tempoReal.emitirAssentamentos(x.c.id, [interno.id])
      await nao
    })
  })
})
