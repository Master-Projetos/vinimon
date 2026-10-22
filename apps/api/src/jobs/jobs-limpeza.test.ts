import { beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, limparBanco } from '../../test/ajudantes'
import { prisma } from '../lib/prisma'
import { purgarAuditoria } from './auditoria-purga'
import { JOBS } from './index'
import { limparSessoes } from './sessoes-limpeza'

const DIA = 24 * 60 * 60 * 1000
const AGORA = new Date('2026-06-15T12:00:00Z')

describe('jobs de limpeza', () => {
  beforeEach(async () => {
    await limparBanco()
  })

  it('registra os jobs de limpeza, com cron', () => {
    expect(JOBS.map((j) => j.fila)).toEqual(expect.arrayContaining(['sessoes-limpeza', 'auditoria-purga']))
    expect(JOBS.every((j) => j.cron !== undefined)).toBe(true)
  })

  it('sessoes-limpeza apaga só sessões expiradas/revogadas há mais de 7 dias e falhas com mais de 24 h', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const nova = (n: string, expiraEm: Date, revogadaEm: Date | null) =>
      prisma.sessao.create({
        data: {
          usuarioId: u.id,
          tokenHash: n.padEnd(64, '0'),
          estado: 'ATIVA',
          criadaEm: new Date(AGORA.getTime() - 60 * DIA),
          expiraEm,
          revogadaEm,
        },
      })
    await nova('a', new Date(AGORA.getTime() - 8 * DIA), null) // expirada há 8 d → apaga
    await nova('b', new Date(AGORA.getTime() + DIA), new Date(AGORA.getTime() - 8 * DIA)) // revogada há 8 d → apaga
    await nova('c', new Date(AGORA.getTime() - 6 * DIA), null) // expirada há 6 d → fica
    await nova('d', new Date(AGORA.getTime() + DIA), new Date(AGORA.getTime() - DIA)) // revogada ontem → fica
    await nova('e', new Date(AGORA.getTime() + DIA), null) // ativa → fica
    await prisma.falhaLogin.create({
      data: { loginNormalizado: 'x', ip: '1.1.1.1', criadoEm: new Date(AGORA.getTime() - 25 * 3600_000) },
    })
    await prisma.falhaLogin.create({
      data: { loginNormalizado: 'x', ip: '1.1.1.1', criadoEm: new Date(AGORA.getTime() - 23 * 3600_000) },
    })

    expect(await limparSessoes(AGORA)).toEqual({ sessoes: 2, falhasLogin: 1 })
    const restantes = await prisma.sessao.findMany({ select: { tokenHash: true }, orderBy: { tokenHash: 'asc' } })
    expect(restantes.map((s) => s.tokenHash[0])).toEqual(['c', 'd', 'e'])
    expect(await prisma.falhaLogin.count()).toBe(1)
    expect(await limparSessoes(AGORA)).toEqual({ sessoes: 0, falhasLogin: 0 }) // idempotente
  })

  it('auditoria-purga apaga só registros com mais de 365 dias (T50)', async () => {
    const inserir = (dias: number) =>
      prisma.$executeRaw`INSERT INTO auditoria (criado_em, ator_tipo, acao, entidade)
        VALUES (now() - make_interval(days => ${dias}), 'SISTEMA', 'teste.purga', 'teste')`
    await inserir(400)
    await inserir(366)
    await inserir(364)
    await inserir(1)

    expect(await purgarAuditoria()).toBe(2)
    const dias = await prisma.$queryRaw<{ d: number }[]>`
      SELECT floor(extract(epoch FROM now() - criado_em) / 86400)::int AS d FROM auditoria ORDER BY d DESC`
    expect(dias.map((r) => r.d)).toEqual([364, 1])
  })

  it('com a GUC ligada, DELETE de registro recente lança 42501', async () => {
    await prisma.$executeRaw`INSERT INTO auditoria (ator_tipo, acao, entidade) VALUES ('SISTEMA', 'teste.recente', 'teste')`
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL vinimon.purga_auditoria = 'on'`
        await tx.$executeRaw`DELETE FROM auditoria WHERE criado_em > now() - interval '1 day'`
      }),
    ).rejects.toThrow(/42501|somente|DELETE só pela purga/)
    expect(await prisma.auditoria.count()).toBe(1)
  })
})
