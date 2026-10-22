import { createHash, randomUUID } from 'node:crypto'
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chaveNova, DiscoLocal } from './armazenamento'
import { ErroApp } from './erros'

describe('DiscoLocal (T44, T45, S65, S67)', () => {
  let raiz: string
  let disco: DiscoLocal
  beforeAll(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'vinimon-anexos-'))
    disco = new DiscoLocal(raiz)
  })
  afterAll(async () => {
    await rm(raiz, { recursive: true, force: true })
  })
  const existe = (c: string) =>
    access(c).then(
      () => true,
      () => false,
    )
  const tmp = async () => (await readdir(join(raiz, 'tmp')).catch(() => [])).length

  it('recebe, calcula sha256 e tamanho, efetiva em AAAA/MM/<uuid> e lê de volta', async () => {
    const conteudo = Buffer.from('conteúdo do anexo')
    const r = await disco.receber(Readable.from([conteudo]), 1024)
    expect(r.tamanho).toBe(conteudo.length)
    expect(r.sha256).toBe(createHash('sha256').update(conteudo).digest('hex'))
    const chave = chaveNova(new Date('2026-03-09T12:00:00Z'), randomUUID())
    expect(chave).toMatch(/^2026\/03\//)
    await disco.efetivar(r.temporario, chave)
    expect(await existe(r.caminhoLocal)).toBe(false)
    const lido = await readFile(join(raiz, chave))
    expect(lido.equals(conteudo)).toBe(true)
    const chunks: Buffer[] = []
    for await (const c of disco.abrirLeitura(chave)) chunks.push(c as Buffer)
    expect(Buffer.concat(chunks).equals(conteudo)).toBe(true)
    await disco.remover(chave)
    expect(await existe(join(raiz, chave))).toBe(false)
  })

  it('limite + 1 byte dá 413 ARQUIVO_GRANDE e o temporário é apagado', async () => {
    const antes = await tmp()
    const erro = await disco.receber(Readable.from([Buffer.alloc(11)]), 10).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroApp)
    expect(erro).toMatchObject({ status: 413, codigo: 'ARQUIVO_GRANDE' })
    expect(await tmp()).toBe(antes)
  })

  it('exatamente no limite é aceito', async () => {
    const r = await disco.receber(Readable.from([Buffer.alloc(10)]), 10)
    expect(r.tamanho).toBe(10)
    await disco.descartar(r.temporario)
    expect(await existe(r.caminhoLocal)).toBe(false)
  })

  it('descartar é idempotente', async () => {
    const r = await disco.receber(Readable.from([Buffer.from('x')]), 10)
    await disco.descartar(r.temporario)
    await expect(disco.descartar(r.temporario)).resolves.toBeUndefined()
  })

  it('chave com path traversal, mês inválido ou formato errado é recusada (T45)', () => {
    for (const chave of [
      '../../etc/passwd',
      '2026/03/../../x',
      '2026/13/' + randomUUID(),
      '2026/03/nao-e-uuid',
      `/2026/03/${randomUUID()}`,
      `2026/03/${randomUUID()}/x`,
    ]) {
      expect(() => disco.resolver(chave), chave).toThrow(ErroApp)
    }
  })

  it('aceita uuid de qualquer versão, inclusive o v8 dos anexos importados', () => {
    expect(() => disco.resolver('2025/12/0197b3a2-7c11-8a00-b000-123456789abc')).not.toThrow()
  })

  it('temporário com nome fora do formato uuid é recusado', async () => {
    await expect(disco.descartar('../../x')).rejects.toBeInstanceOf(ErroApp)
  })
})
