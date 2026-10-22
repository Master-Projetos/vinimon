import { beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, limparBanco } from '../../test/ajudantes'
import { criarChamado, semearBase } from '../../test/fabricas'
import { invalidarConfig } from '../lib/config'
import { prisma } from '../lib/prisma'
import { autoAprovar } from './chamados-auto-aprovacao'
import { retornarAgendados } from './chamados-retorno-agendados'

const DIA = 24 * 60 * 60 * 1000
const ABERTURA = new Date('2026-06-01T12:00:00Z')
const DEPOIS = new Date(ABERTURA.getTime() + 2 * DIA)

describe('jobs de chamados (C09, C15)', () => {
  beforeEach(async () => {
    await limparBanco()
    invalidarConfig()
    await semearBase()
  })

  async function base() {
    const area = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
    return { area, sol, op }
  }
  const estado = (id: number) => prisma.chamado.findUniqueOrThrow({ where: { id } })

  describe('retorno de agendados', () => {
    it('com operador volta a EM_ATENDIMENTO; sem operador, a INICIAL; registra evento e comentário de sistema', async () => {
      const x = await base()
      const comOp = await criarChamado({
        solicitanteId: x.sol.id,
        areaId: x.area.id,
        papel: 'AGENDADO',
        operadorId: x.op.id,
        abertoEm: ABERTURA,
      })
      const semOp = await criarChamado({
        solicitanteId: x.sol.id,
        areaId: x.area.id,
        papel: 'AGENDADO',
        abertoEm: ABERTURA,
      })

      expect(await retornarAgendados(DEPOIS)).toBe(2)
      expect(await estado(comOp.id)).toMatchObject({
        statusTipo: 'EM_ATENDIMENTO',
        operadorId: x.op.id,
        agendadoPara: null,
      })
      expect(await estado(semOp.id)).toMatchObject({ statusTipo: 'ABERTO', operadorId: null, agendadoPara: null })
      expect(await prisma.chamadoEvento.count({ where: { tipo: 'RETORNO_AGENDAMENTO' } })).toBe(2)
      expect(await prisma.assentamento.count({ where: { evento: 'RETORNO_AGENDAMENTO', tipo: 'SISTEMA' } })).toBe(2)
    })

    it('é idempotente e não toca em agendamento futuro', async () => {
      const x = await base()
      const futuro = await criarChamado({
        solicitanteId: x.sol.id,
        areaId: x.area.id,
        papel: 'AGENDADO',
        operadorId: x.op.id,
        abertoEm: ABERTURA,
      })
      await criarChamado({
        solicitanteId: x.sol.id,
        areaId: x.area.id,
        papel: 'AGENDADO',
        operadorId: x.op.id,
        abertoEm: ABERTURA,
      })
      await prisma.chamado.update({
        where: { id: futuro.id },
        data: { agendadoPara: new Date(DEPOIS.getTime() + DIA) },
      })

      expect(await retornarAgendados(DEPOIS)).toBe(1)
      expect(await retornarAgendados(DEPOIS)).toBe(0)
      expect(await prisma.chamadoEvento.count({ where: { tipo: 'RETORNO_AGENDAMENTO' } })).toBe(1)
      expect((await estado(futuro.id)).statusTipo).toBe('AGENDADO')
    })
  })

  describe('auto-aprovação', () => {
    const concluido = async (x: Awaited<ReturnType<typeof base>>, limite: Date | null) => {
      const c = await criarChamado({
        solicitanteId: x.sol.id,
        areaId: x.area.id,
        papel: 'CONCLUIDO',
        operadorId: x.op.id,
        abertoEm: ABERTURA,
      })
      await prisma.chamado.update({ where: { id: c.id }, data: { validacaoLimiteEm: limite } })
      return c
    }

    it('encerra com avaliação automática da configuração, evento AUTO_APROVADO e comentário de sistema', async () => {
      const x = await base()
      await prisma.config.upsert({
        where: { chave: 'chamado.avaliacaoAutomatica' },
        create: { chave: 'chamado.avaliacaoAutomatica', valor: 'BOM' },
        update: { valor: 'BOM' },
      })
      invalidarConfig()
      const c = await concluido(x, new Date(DEPOIS.getTime() - 1000))

      expect(await autoAprovar(DEPOIS)).toBe(1)
      const e = await estado(c.id)
      expect(e.statusTipo).toBe('ENCERRADO')
      expect(e.encerradoEm).not.toBeNull()
      expect(e.validacaoLimiteEm).toBeNull()
      expect(await prisma.avaliacaoChamado.findUniqueOrThrow({ where: { chamadoId: c.id } })).toMatchObject({
        nota: 'BOM',
        automatica: true,
        avaliadorId: null,
      })
      expect(
        await prisma.chamadoEvento.count({ where: { chamadoId: c.id, tipo: 'AUTO_APROVADO', atorId: null } }),
      ).toBe(1)
      expect(
        await prisma.assentamento.count({
          where: { chamadoId: c.id, texto: 'Atendimento validado automaticamente por decurso de prazo' },
        }),
      ).toBe(1)
    })

    it('é idempotente e só pega prazo vencido', async () => {
      const x = await base()
      await concluido(x, new Date(DEPOIS.getTime() - DIA))
      const aindaNoPrazo = await concluido(x, new Date(DEPOIS.getTime() + DIA))

      expect(await autoAprovar(DEPOIS)).toBe(1)
      expect(await autoAprovar(DEPOIS)).toBe(0)
      expect(await prisma.chamadoEvento.count({ where: { tipo: 'AUTO_APROVADO' } })).toBe(1)
      expect(await prisma.avaliacaoChamado.count()).toBe(1)
      expect((await estado(aindaNoPrazo.id)).statusTipo).toBe('CONCLUIDO')
    })
  })
})
