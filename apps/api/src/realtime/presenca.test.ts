import type { Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarUsuario, headersDe, limparBanco } from '../../test/ajudantes'
import { conectar, esperarConectar, esperarEvento, naoRecebe } from '../../test/socket'
import { type App, buildApp } from '../app'
import { prisma } from '../lib/prisma'
import { calcularEstado, PresencaService, podeVerPresenca } from './presenca'

const T0 = new Date('2026-06-15T12:00:00Z')
const emMin = (min: number) => new Date(T0.getTime() + min * 60_000)

describe('calcularEstado (§3.7)', () => {
  const ativa = [{ ativo: true }]
  const inativa = [{ ativo: false }]
  it.each([
    ['sem conexão', [], null, 'OFFLINE'],
    ['sem conexão, mesmo com manual', [], { estado: 'OCUPADO' as const, ate: null }, 'OFFLINE'],
    ['conexão ativa', ativa, null, 'DISPONIVEL'],
    ['conexões todas inativas', [{ ativo: false }, { ativo: false }], null, 'AUSENTE'],
    ['uma ativa entre inativas', [{ ativo: false }, { ativo: true }], null, 'DISPONIVEL'],
    ['manual OCUPADO vigente sem prazo', ativa, { estado: 'OCUPADO' as const, ate: null }, 'OCUPADO'],
    ['manual AUSENTE vigente', ativa, { estado: 'AUSENTE' as const, ate: emMin(10) }, 'AUSENTE'],
    ['manual vencido volta ao automático (ativa)', ativa, { estado: 'OCUPADO' as const, ate: emMin(-1) }, 'DISPONIVEL'],
    [
      'manual vencido volta ao automático (inativa)',
      inativa,
      { estado: 'OCUPADO' as const, ate: emMin(-1) },
      'AUSENTE',
    ],
    ['manual no instante exato do vencimento já venceu', ativa, { estado: 'OCUPADO' as const, ate: T0 }, 'DISPONIVEL'],
  ])('%s', (_nome, conexoes, manual, esperado) => {
    expect(calcularEstado(conexoes, manual, T0)).toBe(esperado)
  })
})

describe('podeVerPresenca (S97, T58)', () => {
  it('a equipe vê todos; o usuário comum só a equipe', () => {
    expect(podeVerPresenca({ perfil: 'USUARIO' }, { perfil: 'USUARIO' })).toBe(false)
    expect(podeVerPresenca({ perfil: 'USUARIO' }, { perfil: 'OPERADOR' })).toBe(true)
    expect(podeVerPresenca({ perfil: 'USUARIO' }, { perfil: 'ADMIN' })).toBe(true)
    expect(podeVerPresenca({ perfil: 'OPERADOR' }, { perfil: 'USUARIO' })).toBe(true)
    expect(podeVerPresenca({ perfil: 'ADMIN' }, { perfil: 'USUARIO' })).toBe(true)
  })
})

describe('PresencaService (relógio injetado)', () => {
  let agora = T0
  const mudou = vi.fn()
  const propria = vi.fn()
  let servico: PresencaService

  beforeEach(async () => {
    await limparBanco()
    agora = T0
    mudou.mockClear()
    propria.mockClear()
    servico = new PresencaService({ mudou, propria }, () => agora)
  })
  afterEach(() => {
    servico.fechar()
  })

  it('conectar vira DISPONIVEL; a última desconexão vira OFFLINE e grava o último visto', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    await servico.conectar(u.id, 's1')
    expect(servico.estadoDe(u.id)).toBe('DISPONIVEL')
    expect(mudou).toHaveBeenCalledWith(u.id, 'DISPONIVEL')
    await servico.conectar(u.id, 's2')
    await servico.desconectar(u.id, 's1')
    expect(servico.estadoDe(u.id)).toBe('DISPONIVEL')
    agora = emMin(3)
    await servico.desconectar(u.id, 's2')
    expect(servico.estadoDe(u.id)).toBe('OFFLINE')
    expect(mudou).toHaveBeenLastCalledWith(u.id, 'OFFLINE')
    expect((await prisma.presencaUsuario.findUniqueOrThrow({ where: { usuarioId: u.id } })).ultimoVistoEm).toEqual(
      emMin(3),
    )
  })

  it('atividade só age quando o valor muda; inativo vira AUSENTE e ativo volta a DISPONIVEL', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    await servico.conectar(u.id, 's1')
    mudou.mockClear()
    await servico.atividade(u.id, 's1', true) // igual ao atual: nada
    expect(mudou).not.toHaveBeenCalled()
    await servico.atividade(u.id, 's1', false)
    expect(servico.estadoDe(u.id)).toBe('AUSENTE')
    expect(mudou).toHaveBeenCalledTimes(1)
    await servico.atividade(u.id, 's1', false)
    expect(mudou).toHaveBeenCalledTimes(1)
    await servico.atividade(u.id, 's1', true)
    expect(servico.estadoDe(u.id)).toBe('DISPONIVEL')
  })

  it('ultimoVistoEm durante atividade: no máximo a cada 5 minutos', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    await servico.conectar(u.id, 's1')
    const visto = async () =>
      (await prisma.presencaUsuario.findUnique({ where: { usuarioId: u.id } }))?.ultimoVistoEm ?? null
    await servico.atividade(u.id, 's1', false)
    agora = emMin(1)
    await servico.atividade(u.id, 's1', true) // primeira gravação
    expect(await visto()).toEqual(emMin(1))
    agora = emMin(3)
    await servico.atividade(u.id, 's1', false)
    await servico.atividade(u.id, 's1', true) // dentro de 5 min: não grava
    expect(await visto()).toEqual(emMin(1))
    agora = emMin(7)
    await servico.atividade(u.id, 's1', false)
    await servico.atividade(u.id, 's1', true)
    expect(await visto()).toEqual(emMin(7))
  })

  it('manual vale até o prazo e depois volta ao automático (relógio injetado)', async () => {
    const u = await criarUsuario({ perfil: 'OPERADOR' })
    await servico.conectar(u.id, 's1')
    const r = await servico.definirManual(u.id, 'OCUPADO', emMin(30))
    expect(r).toMatchObject({ estado: 'OCUPADO', manual: 'OCUPADO' })
    expect(servico.estadoDe(u.id)).toBe('OCUPADO')
    expect(propria).toHaveBeenLastCalledWith(u.id, expect.objectContaining({ estado: 'OCUPADO', manual: 'OCUPADO' }))

    agora = emMin(31)
    servico.reavaliarDepoisDeExpirar(u.id) // o que o timer faria
    expect(servico.estadoDe(u.id)).toBe('DISPONIVEL')
    expect(mudou).toHaveBeenLastCalledWith(u.id, 'DISPONIVEL')
    expect(propria).toHaveBeenLastCalledWith(
      u.id,
      expect.objectContaining({ estado: 'DISPONIVEL', manual: null, ate: null }),
    )
  })

  it('limpar o manual (estado null) volta ao automático na hora', async () => {
    const u = await criarUsuario({ perfil: 'OPERADOR' })
    await servico.conectar(u.id, 's1')
    await servico.definirManual(u.id, 'AUSENTE', null)
    expect(servico.estadoDe(u.id)).toBe('AUSENTE')
    await servico.definirManual(u.id, null, null)
    expect(servico.estadoDe(u.id)).toBe('DISPONIVEL')
    const linha = await prisma.presencaUsuario.findUniqueOrThrow({ where: { usuarioId: u.id } })
    expect(linha).toMatchObject({ estadoManual: null, manualAte: null })
  })

  it('o manual guardado vale na primeira conexão; vencido, não', async () => {
    const vigente = await criarUsuario({ perfil: 'OPERADOR' })
    const vencido = await criarUsuario({ perfil: 'OPERADOR' })
    await prisma.presencaUsuario.create({
      data: { usuarioId: vigente.id, estadoManual: 'OCUPADO', manualAte: emMin(60) },
    })
    await prisma.presencaUsuario.create({
      data: { usuarioId: vencido.id, estadoManual: 'OCUPADO', manualAte: emMin(-60) },
    })
    await servico.conectar(vigente.id, 's1')
    await servico.conectar(vencido.id, 's2')
    expect(servico.estadoDe(vigente.id)).toBe('OCUPADO')
    expect(servico.estadoDe(vencido.id)).toBe('DISPONIVEL')
  })

  it('prazo no passado ou acima de 7 dias dá 400', async () => {
    const u = await criarUsuario({ perfil: 'OPERADOR' })
    await servico.conectar(u.id, 's1')
    await expect(servico.definirManual(u.id, 'OCUPADO', emMin(-1))).rejects.toMatchObject({ status: 400 })
    await expect(servico.definirManual(u.id, 'OCUPADO', emMin(8 * 24 * 60))).rejects.toMatchObject({ status: 400 })
    await expect(servico.definirManual(u.id, 'OCUPADO', emMin(7 * 24 * 60))).resolves.toBeDefined()
  })
})

describe('presença pelo Socket.IO e PUT /me/presenca (S97, T58)', () => {
  let app: App
  const abertos: Socket[] = []

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
  })
  afterEach(() => {
    for (const s of abertos.splice(0)) s.disconnect()
  })

  const ligar = async (usuarioId: number) => {
    const s = await conectar(app, (await headersDe(usuarioId)).cookie)
    abertos.push(s)
    await esperarConectar(s)
    return s
  }
  const assinar = (s: Socket, usuarioIds: number[]) =>
    new Promise<{
      ok: boolean
      presencas?: Array<{ usuarioId: number; estado: string; ultimoVistoEm?: string }>
      erro?: string
    }>((resolver) => {
      s.emit('presenca:assinar', { usuarioIds }, resolver)
    })

  it('T58: USUARIO não recebe presença de outro USUARIO; a equipe sim; o payload é só {usuarioId, estado}', async () => {
    const u1 = await criarUsuario({ perfil: 'USUARIO' })
    const u2 = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR' })
    const s1 = await ligar(u1.id)
    const sOp = await ligar(op.id)
    await new Promise((r) => setTimeout(r, 50))

    const ack = await assinar(s1, [u2.id, op.id])
    expect(ack.ok).toBe(true)
    expect(ack.presencas?.map((p) => p.usuarioId)).toEqual([op.id]) // u2 filtrado
    expect(ack.presencas?.[0]).toEqual({ usuarioId: op.id, estado: 'DISPONIVEL' }) // sem ultimoVistoEm para USUARIO

    // a equipe assina u1 e vê o usuário comum
    const ackOp = await assinar(sOp, [u1.id])
    expect(ackOp.presencas?.map((p) => p.usuarioId)).toEqual([u1.id])

    // u2 conecta: u1 não é avisado; o operador que o assinou... não assinou u2, então nada
    const nao = naoRecebe(s1, 'presenca:mudou')
    const s2 = await ligar(u2.id)
    await nao
    s2.disconnect()

    // o operador muda de estado: quem assinou recebe só {usuarioId, estado}
    const msg = esperarEvento<Record<string, unknown>>(s1, 'presenca:mudou')
    sOp.emit('presenca:atividade', { ativo: false })
    expect(await msg).toEqual({ usuarioId: op.id, estado: 'AUSENTE' })
  })

  it('assinar substitui as assinaturas anteriores; ultimoVistoEm só para a equipe', async () => {
    const op = await criarUsuario({ perfil: 'OPERADOR' })
    const op2 = await criarUsuario({ perfil: 'OPERADOR' })
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    await prisma.presencaUsuario.create({
      data: { usuarioId: sol.id, ultimoVistoEm: new Date('2026-01-01T10:00:00Z') },
    })
    const s = await ligar(op.id)
    const ack = await assinar(s, [sol.id])
    expect(ack.presencas).toEqual([{ usuarioId: sol.id, estado: 'OFFLINE', ultimoVistoEm: '2026-01-01T10:00:00.000Z' }])
    await assinar(s, [op2.id]) // troca: deixa de ouvir o `sol`
    const s2 = await ligar(sol.id)
    const nao = naoRecebe(s, 'presenca:mudou')
    s2.emit('presenca:atividade', { ativo: false })
    await nao
  })

  it('payload inválido recebe INVALIDO; mais de 200 ids também', async () => {
    const op = await criarUsuario({ perfil: 'OPERADOR' })
    const s = await ligar(op.id)
    expect(
      (
        await assinar(
          s,
          Array.from({ length: 201 }, (_, i) => i + 1),
        )
      ).erro,
    ).toBe('INVALIDO')
    expect(
      await new Promise((resolver) => {
        s.emit('presenca:assinar', { usuarioIds: 'x' }, resolver)
      }),
    ).toEqual({ ok: false, erro: 'INVALIDO' })
  })

  it('PUT /me/presenca: define, notifica o próprio usuário e valida o prazo', async () => {
    const u = await criarUsuario({ perfil: 'OPERADOR' })
    const h = await headersDe(u.id)
    const s = await ligar(u.id)
    await new Promise((r) => setTimeout(r, 150)) // deixa passar o `presenca:propria` inicial da conexão
    const propria = esperarEvento<{ estado: string; manual: string | null; ate: string | null }>(s, 'presenca:propria')
    const ate = new Date(Date.now() + 3600_000).toISOString()
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/me/presenca',
      headers: h,
      payload: { estado: 'OCUPADO', ate },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ estado: 'OCUPADO', manual: 'OCUPADO' })
    expect(await propria).toMatchObject({ estado: 'OCUPADO', manual: 'OCUPADO', ate })

    const longe = new Date(Date.now() + 8 * 24 * 3600_000).toISOString()
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/me/presenca',
          headers: h,
          payload: { estado: 'OCUPADO', ate: longe },
        })
      ).statusCode,
    ).toBe(400)
    const passado = new Date(Date.now() - 1000).toISOString()
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/me/presenca',
          headers: h,
          payload: { estado: 'OCUPADO', ate: passado },
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (await app.inject({ method: 'PUT', url: '/api/v1/me/presenca', headers: h, payload: { estado: null, ate } }))
        .statusCode,
    ).toBe(400)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/me/presenca',
          headers: h,
          payload: { estado: 'OUTRO', ate: null },
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/me/presenca',
          headers: h,
          payload: { estado: null, ate: null },
        })
      ).json().manual,
    ).toBeNull()
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/me/presenca',
          headers: { origin: h.origin ?? '' },
          payload: { estado: null, ate: null },
        })
      ).statusCode,
    ).toBe(401)
  })
})
