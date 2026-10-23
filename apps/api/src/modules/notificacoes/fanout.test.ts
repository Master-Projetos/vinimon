import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { buildApp } from '../../app'
import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../../lib/prisma'
import { definirTempoReal, type PublicadorTempoReal, tempoReal } from '../../lib/tempo-real'
import { processarEvento } from './fanout'

const espiao = () => ({
  encerrarSessao: vi.fn(),
  encerrarSessoesDoUsuario: vi.fn(),
  revalidarUsuario: vi.fn(),
  revalidarChamado: vi.fn(),
  emitirAssentamentos: vi.fn(),
  emitirChamadoAtualizado: vi.fn(),
  emitirFila: vi.fn(),
  emitirLeitura: vi.fn(),
  emitirNotificacoes: vi.fn(),
  emitirContagem: vi.fn(),
})

describe('fanout de notificações (S101, S105, §3.8)', () => {
  let publicador: ReturnType<typeof espiao>
  const original: PublicadorTempoReal = tempoReal

  beforeEach(async () => {
    await limparBanco()
    await semearBase()
    publicador = espiao()
    definirTempoReal(publicador)
  })
  afterEach(() => {
    definirTempoReal(original)
  })

  async function cenario() {
    const A = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const colega = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const c = await criarChamado({ solicitanteId: sol.id, areaId: A.id, papel: 'EM_ATENDIMENTO', operadorId: op.id })
    await prisma.chamadoSeguidor.createMany({
      data: [
        { chamadoId: c.id, usuarioId: sol.id, motivo: 'SOLICITANTE' },
        { chamadoId: c.id, usuarioId: op.id, motivo: 'ATRIBUIDO' },
        { chamadoId: c.id, usuarioId: colega.id, motivo: 'COMENTOU' },
      ],
    })
    return { A, sol, op, colega, c }
  }

  const evento = (
    chamadoId: number,
    tipo: Parameters<typeof prisma.chamadoEvento.create>[0]['data']['tipo'],
    atorId: number | null,
    extra: { interno?: boolean; dados?: Prisma.InputJsonObject } = {},
  ) =>
    prisma.chamadoEvento.create({
      data: { chamadoId, tipo, atorId, interno: extra.interno ?? false, dados: extra.dados ?? {} },
      select: { id: true },
    })
  const notificacoes = (chamadoId: number) =>
    prisma.notificacao.findMany({ where: { chamadoId }, orderBy: [{ usuarioId: 'asc' }, { id: 'asc' }] })

  it('comentário público: notifica os seguidores, menos o ator', async () => {
    const x = await cenario()
    const ev = await evento(x.c.id, 'COMENTARIO', x.op.id)
    expect((await processarEvento(ev.id)).length).toBe(2)
    const n = await notificacoes(x.c.id)
    expect(n.map((i) => [i.usuarioId, i.tipo]).sort()).toEqual(
      [
        [x.sol.id, 'COMENTARIO'],
        [x.colega.id, 'COMENTARIO'],
      ].sort(),
    )
    expect(n.every((i) => i.contagem === 1 && i.atorIds[0] === x.op.id && !i.lidaEm)).toBe(true)
    expect(publicador.emitirNotificacoes).toHaveBeenCalledTimes(1)
    expect(publicador.emitirContagem).toHaveBeenCalledWith(x.sol.id, 1)
    expect(publicador.emitirContagem).not.toHaveBeenCalledWith(x.op.id, expect.anything())
    expect((await prisma.chamadoEvento.findUniqueOrThrow({ where: { id: ev.id } })).processadoEm).not.toBeNull()
  })

  it('comentário interno não notifica o seguidor USUARIO nem conta para ele', async () => {
    const x = await cenario()
    const ev = await evento(x.c.id, 'COMENTARIO', x.op.id, { interno: true })
    await processarEvento(ev.id)
    const n = await notificacoes(x.c.id)
    expect(n.map((i) => i.usuarioId)).toEqual([x.colega.id])
    expect(n[0]?.interno).toBe(true)
    expect(publicador.emitirContagem).not.toHaveBeenCalledWith(x.sol.id, expect.anything())
  })

  it('o ator nunca recebe, nem quando é seguidor', async () => {
    const x = await cenario()
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.sol.id)).id)
    expect((await notificacoes(x.c.id)).map((i) => i.usuarioId).sort()).toEqual([x.op.id, x.colega.id].sort())
  })

  it('dois comentários viram uma linha com contagem=2; depois de lida, nasce linha nova', async () => {
    const x = await cenario()
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.op.id)).id)
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.colega.id)).id)
    const doSolicitante = (await notificacoes(x.c.id)).filter((i) => i.usuarioId === x.sol.id)
    expect(doSolicitante).toHaveLength(1)
    expect(doSolicitante[0]).toMatchObject({ contagem: 2 })
    expect(doSolicitante[0]?.atorIds).toEqual([x.colega.id, x.op.id])

    const id = doSolicitante[0]?.id ?? 0
    await prisma.$executeRaw`UPDATE notificacoes SET lida_em = now(), grupo_chave = grupo_chave || '#' || id WHERE id = ${id}`
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.op.id)).id)
    const depois = (await notificacoes(x.c.id)).filter((i) => i.usuarioId === x.sol.id)
    expect(depois).toHaveLength(2)
    expect(depois.filter((i) => i.lidaEm === null)).toHaveLength(1)
    expect(depois.find((i) => i.lidaEm === null)?.contagem).toBe(1)
  })

  it('dois STATUS_ALTERADO seguidos: a notificação mostra o último status', async () => {
    const x = await cenario()
    const status = (nome: string) => ({ dados: { de: { id: 1, nome: 'x' }, para: { id: 2, nome } } })
    await processarEvento((await evento(x.c.id, 'STATUS_ALTERADO', x.op.id, status('Pendente'))).id)
    await processarEvento((await evento(x.c.id, 'STATUS_ALTERADO', x.op.id, status('Em atendimento'))).id)
    const n = (await notificacoes(x.c.id)).filter((i) => i.usuarioId === x.sol.id)
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ tipo: 'STATUS', contagem: 2, dados: { statusNome: 'Em atendimento' } })
  })

  it('mencionado recebe MENCAO (e os demais, COMENTARIO); sem acesso ao chamado, ninguém', async () => {
    const x = await cenario()
    const forasteiro = await criarUsuario({ perfil: 'USUARIO' })
    const ev = await evento(x.c.id, 'COMENTARIO', x.op.id, { dados: { mencionados: [x.colega.id, forasteiro.id] } })
    await processarEvento(ev.id)
    const n = await notificacoes(x.c.id)
    expect(n.find((i) => i.usuarioId === x.colega.id)).toMatchObject({ tipo: 'MENCAO', grupoChave: `mencao:${ev.id}` })
    expect(n.find((i) => i.usuarioId === x.sol.id)?.tipo).toBe('COMENTARIO')
    expect(n.some((i) => i.usuarioId === forasteiro.id)).toBe(false)
  })

  it('seguidor silenciado não recebe COMENTARIO, mas a menção ignora o silenciamento', async () => {
    const x = await cenario()
    await prisma.chamadoSeguidor.update({
      where: { chamadoId_usuarioId: { chamadoId: x.c.id, usuarioId: x.colega.id } },
      data: { silenciadoEm: new Date() },
    })
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.op.id)).id)
    expect((await notificacoes(x.c.id)).some((i) => i.usuarioId === x.colega.id)).toBe(false)
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.op.id, { dados: { mencionados: [x.colega.id] } })).id)
    expect((await notificacoes(x.c.id)).find((i) => i.usuarioId === x.colega.id)?.tipo).toBe('MENCAO')
  })

  it('preferência desligada vale para tipos comuns e é ignorada nos fixos', async () => {
    const x = await cenario()
    await prisma.preferenciaNotificacao.createMany({
      data: [
        { usuarioId: x.sol.id, tipo: 'COMENTARIO', inApp: false, desktop: false },
        { usuarioId: x.colega.id, tipo: 'MENCAO', inApp: false, desktop: false },
      ],
    })
    await processarEvento((await evento(x.c.id, 'COMENTARIO', x.op.id, { dados: { mencionados: [x.colega.id] } })).id)
    const n = await notificacoes(x.c.id)
    expect(n.some((i) => i.usuarioId === x.sol.id)).toBe(false)
    expect(n.find((i) => i.usuarioId === x.colega.id)?.tipo).toBe('MENCAO')
  })

  it('CRIADO sem responsável avisa os operadores da área (menos o ator), com o nome da área', async () => {
    const x = await cenario()
    const ev = await evento(x.c.id, 'CRIADO', x.sol.id, { dados: { emNomeDeOutro: false } })
    await processarEvento(ev.id)
    const n = await notificacoes(x.c.id)
    expect(n.map((i) => [i.usuarioId, i.tipo]).sort()).toEqual(
      [
        [x.op.id, 'NOVO_NA_FILA'],
        [x.colega.id, 'NOVO_NA_FILA'],
      ].sort(),
    )
    expect(n[0]?.dados).toMatchObject({ areaNome: expect.any(String) })
  })

  it('uma chamada concorrente de processarEvento gera uma notificação só por destinatário', async () => {
    const x = await cenario()
    const ev = await evento(x.c.id, 'COMENTARIO', x.op.id)
    const [a, b] = await Promise.all([processarEvento(ev.id), processarEvento(ev.id)])
    expect(a.length + b.length).toBe(2)
    const n = await notificacoes(x.c.id)
    expect(n).toHaveLength(2)
    expect(n.every((i) => i.contagem === 1)).toBe(true)
  })

  it('evento já processado ou inexistente não faz nada', async () => {
    const x = await cenario()
    const ev = await evento(x.c.id, 'COMENTARIO', x.op.id)
    await processarEvento(ev.id)
    expect(await processarEvento(ev.id)).toEqual([])
    expect(await processarEvento(999_999)).toEqual([])
    expect(await prisma.notificacao.count()).toBe(2)
  })

  it('N+1: 5 e 50 seguidores executam o mesmo número de queries (no máximo 10)', async () => {
    const medir = async (quantos: number) => {
      await limparBanco()
      await semearBase()
      const x = await cenario()
      for (let i = 0; i < quantos; i++) {
        const u = await criarUsuario({ perfil: 'OPERADOR', areaId: x.A.id })
        await prisma.chamadoSeguidor.create({ data: { chamadoId: x.c.id, usuarioId: u.id, motivo: 'COMENTOU' } })
      }
      const ev = await evento(x.c.id, 'COMENTARIO', x.op.id)
      let n = 0
      let medindo = true
      const contar = () => {
        if (medindo) n++
      }
      prisma.$on('query', contar)
      const ids = await processarEvento(ev.id)
      medindo = false // o listener do Prisma não se remove: para de contar
      expect(ids.length).toBeGreaterThanOrEqual(quantos)
      return n
    }
    const com5 = await medir(5)
    const com50 = await medir(50)
    expect(com50).toBe(com5)
    expect(com5).toBeLessThanOrEqual(10)
  })

  it('integração: um comentário pela API notifica o solicitante pelo passo 4 do pós-commit', async () => {
    const x = await cenario()
    const app = await buildApp({ logger: false })
    await app.ready()
    definirTempoReal(publicador) // o plugin de tempo real instala o próprio publicador no buildApp
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/chamados/${x.c.id}/assentamentos`,
        headers: await headersDe(x.op.id),
        payload: { texto: 'Olá!', interno: false, clienteId: randomUUID() },
      })
      expect(res.statusCode).toBe(201)
      const n = await notificacoes(x.c.id)
      expect(n.find((i) => i.usuarioId === x.sol.id)).toMatchObject({ tipo: 'COMENTARIO', contagem: 1 })
      expect(publicador.emitirContagem).toHaveBeenCalledWith(x.sol.id, 1)
    } finally {
      await app.close()
    }
  })
})
