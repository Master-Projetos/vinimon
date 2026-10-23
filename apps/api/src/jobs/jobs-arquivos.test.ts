import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, limparBanco } from '../../test/ajudantes'
import { criarChamado, semearBase } from '../../test/fabricas'
import { invalidarConfig } from '../lib/config'
import { prisma } from '../lib/prisma'
import { removerAnexosOrfaos } from './anexos-orfaos'
import { JOBS } from './index'
import { limparNotificacoes } from './notificacoes-limpeza'

const DIA = 24 * 60 * 60 * 1000
const AGORA = new Date('2026-06-15T12:00:00Z')

describe('jobs de limpeza de notificações e arquivos órfãos (S123)', () => {
  beforeEach(async () => {
    await limparBanco()
    invalidarConfig()
    await semearBase()
  })

  it('registra as duas filas com cron', () => {
    expect(JOBS.find((j) => j.fila === 'notificacoes-limpeza')?.cron).toBe('23 3 * * *')
    expect(JOBS.find((j) => j.fila === 'anexos-orfaos')?.cron).toBe('41 3 * * *')
  })

  describe('notificacoes-limpeza', () => {
    it('apaga só as lidas há mais de notificacoes.retencaoDias (padrão 180); não lidas ficam', async () => {
      const area = await criarArea()
      const sol = await criarUsuario({ perfil: 'USUARIO' })
      const c = await criarChamado({ solicitanteId: sol.id, areaId: area.id, papel: 'INICIAL' })
      const nova = (chave: string, lidaEm: Date | null) =>
        prisma.notificacao.create({
          data: { usuarioId: sol.id, chamadoId: c.id, tipo: 'STATUS', grupoChave: chave, lidaEm },
        })
      await nova('a', new Date(AGORA.getTime() - 181 * DIA)) // velha: apaga
      await nova('b', new Date(AGORA.getTime() - 179 * DIA)) // dentro da retenção: fica
      await nova('c', null) // não lida: fica, por mais velha que seja

      expect(await limparNotificacoes(AGORA)).toBe(1)
      expect((await prisma.notificacao.findMany({ orderBy: { grupoChave: 'asc' } })).map((n) => n.grupoChave)).toEqual([
        'b',
        'c',
      ])
      expect(await limparNotificacoes(AGORA)).toBe(0) // idempotente
    })

    it('respeita a retenção configurada', async () => {
      const area = await criarArea()
      const sol = await criarUsuario({ perfil: 'USUARIO' })
      const c = await criarChamado({ solicitanteId: sol.id, areaId: area.id, papel: 'INICIAL' })
      await prisma.config.upsert({
        where: { chave: 'notificacoes.retencaoDias' },
        create: { chave: 'notificacoes.retencaoDias', valor: 30 },
        update: { valor: 30 },
      })
      invalidarConfig()
      await prisma.notificacao.create({
        data: {
          usuarioId: sol.id,
          chamadoId: c.id,
          tipo: 'STATUS',
          grupoChave: 'x',
          lidaEm: new Date(AGORA.getTime() - 31 * DIA),
        },
      })
      expect(await limparNotificacoes(AGORA)).toBe(1)
    })
  })

  describe('anexos-orfaos', () => {
    let raiz = ''
    beforeEach(async () => {
      raiz = await mkdtemp(join(tmpdir(), 'vinimon-orfaos-'))
    })
    afterEach(async () => {
      await rm(raiz, { recursive: true, force: true })
    })

    const arquivo = async (relativo: string, idadeDias: number) => {
      const caminho = join(raiz, relativo)
      await mkdir(join(caminho, '..'), { recursive: true })
      await writeFile(caminho, 'x')
      const quando = new Date(AGORA.getTime() - idadeDias * DIA)
      await utimes(caminho, quando, quando)
      return caminho
    }

    it('o órfão recente fica e o antigo sai; vale também para tmp/', async () => {
      const antigo = await arquivo(`2026/05/${randomUUID()}`, 3)
      const recente = await arquivo(`2026/06/${randomUUID()}`, 0.5)
      const tmpAntigo = await arquivo(`tmp/${randomUUID()}`, 2)
      const tmpRecente = await arquivo(`tmp/${randomUUID()}`, 0.1)

      expect(await removerAnexosOrfaos(AGORA, raiz)).toBe(2)
      expect(existsSync(antigo)).toBe(false)
      expect(existsSync(tmpAntigo)).toBe(false)
      expect(existsSync(recente)).toBe(true)
      expect(existsSync(tmpRecente)).toBe(true)
      expect(await removerAnexosOrfaos(AGORA, raiz)).toBe(0)
    })

    it('o arquivo de um anexo existente fica, por mais antigo que seja', async () => {
      const area = await criarArea()
      const sol = await criarUsuario({ perfil: 'USUARIO' })
      const c = await criarChamado({ solicitanteId: sol.id, areaId: area.id, papel: 'INICIAL' })
      const id = randomUUID()
      const chave = `2026/01/${id}`
      await prisma.anexo.create({
        data: {
          id,
          chamadoId: c.id,
          enviadoPorId: sol.id,
          nomeOriginal: 'a.png',
          mime: 'image/png',
          tamanho: 1,
          sha256: 'a'.repeat(64),
          storageChave: chave,
        },
      })
      const vivo = await arquivo(chave, 400)
      const orfao = await arquivo(`2026/01/${randomUUID()}`, 400)
      expect(await removerAnexosOrfaos(AGORA, raiz)).toBe(1)
      expect(existsSync(vivo)).toBe(true)
      expect(existsSync(orfao)).toBe(false)
    })

    it('confere as chaves em lotes (mais de 500 arquivos) e não toca em arquivos ocultos nem em diretório inexistente', async () => {
      const area = await criarArea()
      const sol = await criarUsuario({ perfil: 'USUARIO' })
      const c = await criarChamado({ solicitanteId: sol.id, areaId: area.id, papel: 'INICIAL' })
      const vivos: string[] = []
      for (let i = 0; i < 3; i++) {
        const id = randomUUID()
        const chave = `2026/02/${id}`
        await prisma.anexo.create({
          data: {
            id,
            chamadoId: c.id,
            enviadoPorId: sol.id,
            nomeOriginal: 'a.png',
            mime: 'image/png',
            tamanho: 1,
            sha256: 'b'.repeat(64),
            storageChave: chave,
          },
        })
        vivos.push(await arquivo(chave, 10))
      }
      for (let i = 0; i < 520; i++) await arquivo(`2026/03/${randomUUID()}`, 10)
      const oculto = await arquivo('2026/03/.gitkeep', 10)

      expect(await removerAnexosOrfaos(AGORA, raiz)).toBe(520)
      for (const v of vivos) expect(existsSync(v)).toBe(true)
      expect(existsSync(oculto)).toBe(true)
      expect(await removerAnexosOrfaos(AGORA, join(raiz, 'nao-existe'))).toBe(0)
    })
  })
})
