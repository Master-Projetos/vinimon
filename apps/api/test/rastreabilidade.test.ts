// apps/api/test/rastreabilidade.test.ts
// T-11.11: cada teste de segurança T05–T62 da §5.2 precisa aparecer no título de algum it(...)/test(...).
// Só lê arquivos; não usa banco.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = resolve(import.meta.dirname, '../../..')
const PASTAS = ['apps/api', 'packages/shared']
const IGNORAR = new Set(['node_modules', 'dist', 'generated', 'coverage', 'storage'])

function arquivosDeTeste(dir: string): string[] {
  const saida: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(entrada.name)) continue
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) saida.push(...arquivosDeTeste(caminho))
    else if (entrada.name.endsWith('.test.ts')) saida.push(caminho)
  }
  return saida
}

/** Títulos de it(...)/test(...) (inclusive it.each(...)(...)), com o título na mesma linha ou na seguinte. */
const TITULO = /\b(?:it|test)(?:\.each\([^)]*\))?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g

function titulosDeTeste(fonte: string): string[] {
  return [...fonte.matchAll(TITULO)].map((m) => m[2] ?? '')
}

const esperados = Array.from({ length: 62 - 5 + 1 }, (_, i) => `T${String(i + 5).padStart(2, '0')}`)

describe('rastreabilidade dos testes de segurança (T-11.11)', () => {
  const arquivos = PASTAS.flatMap((p) => arquivosDeTeste(join(RAIZ, p)))
  const titulos = arquivos.flatMap((a) => titulosDeTeste(readFileSync(a, 'utf8')))

  it('encontra os arquivos de teste da API e do shared', () => {
    expect(arquivos.length).toBeGreaterThan(20)
    expect(titulos.length).toBeGreaterThan(100)
  })

  it('cada T05–T62 aparece no título de algum it(...)', () => {
    const faltando = esperados.filter((t) => !titulos.some((titulo) => new RegExp(`\\b${t}\\b`).test(titulo)))
    expect(faltando).toEqual([])
  })
})
