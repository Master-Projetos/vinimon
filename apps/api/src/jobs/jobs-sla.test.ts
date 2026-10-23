import { beforeEach, describe, expect, it, vi } from 'vitest'
import { criarArea, criarUsuario, limparBanco } from '../../test/ajudantes'
import { criarChamado, semearBase } from '../../test/fabricas'
import { invalidarConfig } from '../lib/config'
import { prisma } from '../lib/prisma'
import { definirTempoReal, tempoReal } from '../lib/tempo-real'
import { varrerEventos } from './eventos-varrer'
import { JOBS } from './index'
import { alertarSla } from './sla-alertas'
import { recalcularJornada } from './sla-recalcular-jornada'

const AGORA = new Date('2026-06-15T12:00:00Z')
const emMin = (min: number) => new Date(AGORA.getTime() + min * 60_000)

describe('jobs de SLA e varredura de eventos (§3.10)', () => {
  beforeEach(async () => {
    await limparBanco()
    invalidarConfig()
    await semearBase()
  })

  async function base() {
    const area = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
    const novo = (dados: Partial<Parameters<typeof criarChamado>[0]> = {}) =>
      criarChamado({
        solicitanteId: sol.id,
        areaId: area.id,
        papel: 'EM_ATENDIMENTO',
        operadorId: op.id,
        abertoEm: emMin(-240), // antes de qualquer data usada nos testes (CHECK de datas)
        ...dados,
      })
    return { area, sol, op, novo }
  }
  const eventos = (tipo: string) =>
    prisma.chamadoEvento.findMany({ where: { tipo: tipo as never }, orderBy: { id: 'asc' } })

  it('registra as filas dos três jobs', () => {
    expect(JOBS.map((j) => j.fila)).toEqual(
      expect.arrayContaining(['sla-alertas', 'sla-recalcular-jornada', 'eventos-varrer']),
    )
    expect(JOBS.find((j) => j.fila === 'sla-recalcular-jornada')?.cron).toBeUndefined()
  })

  describe('sla-alertas', () => {
    it('risco, estouro e estouro de resposta geram um evento cada e notificam o responsável (tipo SLA)', async () => {
      const x = await base()
      const risco = await x.novo()
      const estouro = await x.novo()
      const resposta = await x.novo()
      await prisma.chamado.update({
        where: { id: risco.id },
        data: { alertaSolucaoEm: emMin(-5), prazoSolucaoEm: emMin(30) },
      })
      await prisma.chamado.update({
        where: { id: estouro.id },
        data: { alertaSolucaoEm: emMin(-60), prazoSolucaoEm: emMin(-1) },
      })
      await prisma.chamado.update({ where: { id: resposta.id }, data: { prazoRespostaEm: emMin(-1) } })

      expect(await alertarSla(AGORA)).toBe(3) // o chamado estourado também já passou do alerta, mas vira ESTOURADO, não RISCO
      expect((await eventos('SLA_RISCO')).map((e) => e.chamadoId)).toEqual([risco.id])
      expect((await eventos('SLA_ESTOURADO')).map((e) => e.chamadoId)).toEqual([estouro.id])
      expect((await eventos('SLA_RESPOSTA_ESTOURADO')).map((e) => e.chamadoId)).toEqual([resposta.id])
      const ev = await eventos('SLA_RISCO')
      expect(ev[0]).toMatchObject({ atorId: null, interno: false, processadoEm: expect.any(Date) })

      const notificacoes = await prisma.notificacao.findMany({ where: { tipo: 'SLA' }, orderBy: { id: 'asc' } })
      expect(notificacoes.every((n) => n.usuarioId === x.op.id)).toBe(true)
      expect(notificacoes.map((n) => (n.dados as { marco?: string }).marco).sort()).toEqual(
        ['ESTOURADO', 'RESPOSTA_ESTOURADO', 'RISCO'].sort(),
      )
    })

    it('rodar o alerta 2 vezes gera 1 evento', async () => {
      const x = await base()
      const c = await x.novo()
      await prisma.chamado.update({
        where: { id: c.id },
        data: { alertaSolucaoEm: emMin(-5), prazoSolucaoEm: emMin(30) },
      })
      expect(await alertarSla(AGORA)).toBe(1)
      expect(await alertarSla(AGORA)).toBe(0)
      expect(await alertarSla(emMin(10))).toBe(0)
      expect(await eventos('SLA_RISCO')).toHaveLength(1)
      expect((await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })).slaAvisoRiscoEm).toEqual(AGORA)
    })

    it('duas execuções simultâneas também geram 1 evento', async () => {
      const x = await base()
      const c = await x.novo()
      await prisma.chamado.update({ where: { id: c.id }, data: { prazoSolucaoEm: emMin(-1) } })
      const [a, b] = await Promise.all([alertarSla(AGORA), alertarSla(AGORA)])
      expect(a + b).toBe(1)
      expect(await eventos('SLA_ESTOURADO')).toHaveLength(1)
    })

    it('ignora concluídos, cancelados, quem já tem resposta e prazos ainda no futuro', async () => {
      const x = await base()
      const concluido = await x.novo({ papel: 'CONCLUIDO' })
      const cancelado = await x.novo({ papel: 'CANCELADO' })
      const respondido = await x.novo()
      const futuro = await x.novo()
      const vencido = { prazoSolucaoEm: emMin(-10), alertaSolucaoEm: emMin(-20) }
      await prisma.chamado.update({ where: { id: concluido.id }, data: vencido })
      await prisma.chamado.update({ where: { id: cancelado.id }, data: vencido })
      await prisma.chamado.update({
        where: { id: respondido.id },
        data: { prazoRespostaEm: emMin(-10), primeiraRespostaEm: emMin(-30) },
      })
      await prisma.chamado.update({
        where: { id: futuro.id },
        data: { alertaSolucaoEm: emMin(10), prazoSolucaoEm: emMin(60), prazoRespostaEm: emMin(60) },
      })
      expect(await alertarSla(AGORA)).toBe(0)
      expect(await prisma.chamadoEvento.count()).toBe(0)
    })

    it('mudar o prazo (recálculo) zera o aviso e permite um novo alerta', async () => {
      const x = await base()
      const c = await x.novo({ slaSolucaoMin: 60 })
      await prisma.chamado.update({ where: { id: c.id }, data: { prazoSolucaoEm: emMin(-1) } })
      await alertarSla(AGORA)
      expect((await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })).slaAvisoEstouroEm).not.toBeNull()
      await prisma.chamado.update({ where: { id: c.id }, data: { slaAvisoEstouroEm: null, prazoSolucaoEm: emMin(-2) } })
      expect(await alertarSla(emMin(1))).toBe(1)
      expect(await eventos('SLA_ESTOURADO')).toHaveLength(2)
    })
  })

  describe('sla-recalcular-jornada', () => {
    it('recalcula os chamados em aberto da jornada, zera os avisos quando o prazo muda e ignora concluídos e outras jornadas', async () => {
      const x = await base()
      const aberto = await x.novo({ slaSolucaoMin: 120 })
      const concluido = await x.novo({ papel: 'CONCLUIDO', slaSolucaoMin: 120 })
      const outraJornada = await prisma.jornada.create({
        data: { nome: 'Outra', timezone: 'America/Sao_Paulo', ininterrupta: true },
        select: { id: true },
      })
      const alheio = await x.novo({ slaSolucaoMin: 120, jornadaId: outraJornada.id })
      const errado = new Date('2030-01-01T00:00:00Z')
      for (const c of [aberto, concluido, alheio])
        await prisma.chamado.update({ where: { id: c.id }, data: { prazoSolucaoEm: errado, slaAvisoEstouroEm: AGORA } })

      expect(await recalcularJornada(aberto.jornadaId, AGORA)).toBe(1)
      const depois = await prisma.chamado.findUniqueOrThrow({ where: { id: aberto.id } })
      expect(depois.prazoSolucaoEm?.getTime()).toBe(aberto.abertoEm.getTime() + 120 * 60_000) // jornada 24x7
      expect(depois.slaAvisoEstouroEm).toBeNull()
      expect((await prisma.chamado.findUniqueOrThrow({ where: { id: concluido.id } })).prazoSolucaoEm).toEqual(errado)
      expect((await prisma.chamado.findUniqueOrThrow({ where: { id: alheio.id } })).prazoSolucaoEm).toEqual(errado)
      expect(await recalcularJornada(aberto.jornadaId, AGORA)).toBe(1) // idempotente
    })

    it('o job ignora payload sem jornadaId numérico', async () => {
      const job = JOBS.find((j) => j.fila === 'sla-recalcular-jornada')
      await expect(job?.executar({}, AGORA)).resolves.toBeUndefined()
      await expect(job?.executar({ jornadaId: 'x' }, AGORA)).resolves.toBeUndefined()
    })
  })

  describe('eventos-varrer', () => {
    it('reprocessa evento pendente há mais de 1 minuto (fanout que falhou) e deixa os recentes', async () => {
      const x = await base()
      const c = await x.novo()
      await prisma.chamadoSeguidor.create({ data: { chamadoId: c.id, usuarioId: x.sol.id, motivo: 'SOLICITANTE' } })
      const novo = (criadoEm: Date) =>
        prisma.chamadoEvento.create({
          data: {
            chamadoId: c.id,
            tipo: 'STATUS_ALTERADO',
            atorId: x.op.id,
            dados: { para: { id: 1, nome: 'X' } },
            criadoEm,
          },
          select: { id: true },
        })
      const velho = await novo(emMin(-5))
      const recente = await novo(emMin(0))

      expect(await varrerEventos(AGORA)).toBe(1)
      expect((await prisma.chamadoEvento.findUniqueOrThrow({ where: { id: velho.id } })).processadoEm).not.toBeNull()
      expect((await prisma.chamadoEvento.findUniqueOrThrow({ where: { id: recente.id } })).processadoEm).toBeNull()
      expect(await prisma.notificacao.count({ where: { usuarioId: x.sol.id, tipo: 'STATUS' } })).toBe(1)

      expect(await varrerEventos(AGORA)).toBe(0) // idempotente
      expect(await varrerEventos(emMin(5))).toBe(1) // agora o recente também passou de 1 min
      expect((await prisma.notificacao.findFirstOrThrow({ where: { usuarioId: x.sol.id } })).contagem).toBe(2)
    })

    it('processa no máximo 200 por execução, do mais antigo', async () => {
      const x = await base()
      const c = await x.novo()
      await prisma.chamadoEvento.createMany({
        data: Array.from({ length: 205 }, () => ({
          chamadoId: c.id,
          tipo: 'ANEXO_REMOVIDO' as const,
          atorId: x.op.id,
          criadoEm: emMin(-10),
        })),
      })
      expect(await varrerEventos(AGORA)).toBe(200)
      expect(await prisma.chamadoEvento.count({ where: { processadoEm: null } })).toBe(5)
      expect(await varrerEventos(AGORA)).toBe(5)
    })
  })

  it('a falha do publicador não impede o registro do alerta', async () => {
    const x = await base()
    const c = await x.novo()
    await prisma.chamado.update({ where: { id: c.id }, data: { prazoSolucaoEm: emMin(-1) } })
    const original = tempoReal
    definirTempoReal({
      ...original,
      emitirNotificacoes: vi.fn(() => {
        throw new Error('socket fora do ar')
      }),
    })
    try {
      expect(await alertarSla(AGORA)).toBe(1)
      expect(await eventos('SLA_ESTOURADO')).toHaveLength(1)
    } finally {
      definirTempoReal(original)
    }
  })
})
