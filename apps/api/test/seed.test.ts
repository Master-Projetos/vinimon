import { beforeEach, describe, expect, it } from 'vitest'
import { seedBase, seedInicial } from '../prisma/seed'
import { prisma } from '../src/lib/prisma'
import { verificarSenha } from '../src/lib/senha'
import { limparBanco } from './ajudantes'

async function semear() {
  return prisma.$transaction(async (tx) => {
    await seedBase(tx, { catalogos: true })
    return seedInicial(tx)
  })
}
const contagens = async () => ({
  config: await prisma.config.count(),
  canais: await prisma.canal.count(),
  jornadas: await prisma.jornada.count(),
  horarios: await prisma.jornadaHorario.count(),
  feriados: await prisma.feriado.count(),
  status: await prisma.status.count(),
  prioridades: await prisma.prioridade.count(),
  areas: await prisma.area.count(),
  usuarios: await prisma.usuario.count(),
})

describe('seed (T09)', () => {
  beforeEach(limparBanco)

  it('T09: é idempotente e cria o admin com troca de senha obrigatória', async () => {
    const senha = await semear()
    const primeira = await contagens()
    expect(await semear()).toBeNull()
    expect(await contagens()).toEqual(primeira)

    expect(primeira).toMatchObject({ status: 9, prioridades: 4, usuarios: 1, jornadas: 2, feriados: 9, horarios: 10 })
    expect(await prisma.canal.count({ where: { sistema: true } })).toBe(5)
    expect(await prisma.status.count({ where: { papel: { not: null } } })).toBe(8)
    expect(await prisma.prioridade.count({ where: { padrao: true } })).toBe(1)

    const admin = await prisma.usuario.findUniqueOrThrow({
      where: { login: 'admin' },
      select: { id: true, perfil: true, deveTrocarSenha: true },
    })
    expect(admin).toMatchObject({ perfil: 'ADMIN', deveTrocarSenha: true })

    // A senha impressa autentica (o hash fica fora do select padrão do cliente).
    const [linha] = await prisma.$queryRaw<
      { senha_hash: string }[]
    >`SELECT senha_hash FROM usuarios WHERE login = 'admin'`
    expect(senha).toMatch(/^[A-Za-z0-9]{20}$/)
    expect((await verificarSenha(senha ?? '', linha?.senha_hash ?? '')).ok).toBe(true)
  })

  it('grava a jornada 24x7 como padrão de SLA', async () => {
    await semear()
    const j = await prisma.jornada.findUniqueOrThrow({ where: { nome: '24x7' }, select: { id: true } })
    const cfg = await prisma.config.findUniqueOrThrow({ where: { chave: 'sla.jornadaPadraoId' } })
    expect(cfg.valor).toBe(j.id)
  })

  it('o importador (catalogos:false) não cria status nem prioridades', async () => {
    await prisma.$transaction((tx) => seedBase(tx, { catalogos: false }))
    expect(await prisma.status.count()).toBe(0)
    expect(await prisma.prioridade.count()).toBe(0)
    expect(await prisma.canal.count()).toBe(5)
  })
})
