import { describe, expect, it } from 'vitest'
import { type DefinicaoCampo, schemaDosCampos } from './campos'
import { CriarCampoPersonalizadoSchema } from './modulos/campos-personalizados'

const campo = (c: Partial<DefinicaoCampo> & Pick<DefinicaoCampo, 'tipo'>): DefinicaoCampo => ({
  chave: 'x',
  rotulo: 'X',
  opcoes: [],
  obrigatorio: false,
  regex: null,
  visibilidade: 'ABERTURA',
  ...c,
})
const ok = (c: DefinicaoCampo, v: unknown, etapa: 'abertura' | 'edicao' = 'abertura') =>
  schemaDosCampos([c], etapa).safeParse(v === undefined ? {} : { x: v }).success

describe('schemaDosCampos', () => {
  it('TEXTO e AREA_TEXTO respeitam o limite', () => {
    expect(ok(campo({ tipo: 'TEXTO' }), 'a'.repeat(500))).toBe(true)
    expect(ok(campo({ tipo: 'TEXTO' }), 'a'.repeat(501))).toBe(false)
    expect(ok(campo({ tipo: 'AREA_TEXTO' }), 'a'.repeat(5000))).toBe(true)
    expect(ok(campo({ tipo: 'AREA_TEXTO' }), 'a'.repeat(5001))).toBe(false)
  })
  it('regex vale para texto', () => {
    const c = campo({ tipo: 'TEXTO', regex: '^\\d{3}$' })
    expect(ok(c, '123')).toBe(true)
    expect(ok(c, 'abc')).toBe(false)
  })
  it('NUMERO aceita número e recusa texto', () => {
    expect(ok(campo({ tipo: 'NUMERO' }), 12.5)).toBe(true)
    expect(ok(campo({ tipo: 'NUMERO' }), '12')).toBe(false)
  })
  it('SELECAO e SELECAO_MULTIPLA só aceitam opções definidas', () => {
    const s = campo({ tipo: 'SELECAO', opcoes: ['a', 'b'] })
    expect(ok(s, 'a')).toBe(true)
    expect(ok(s, 'c')).toBe(false)
    const m = campo({ tipo: 'SELECAO_MULTIPLA', opcoes: ['a', 'b'] })
    expect(ok(m, ['a', 'b'])).toBe(true)
    expect(ok(m, ['a', 'z'])).toBe(false)
    expect(ok(m, ['a', 'a'])).toBe(false)
  })
  it('DATA, HORA e DATA_HORA validam o formato', () => {
    expect(ok(campo({ tipo: 'DATA' }), '2026-02-28')).toBe(true)
    expect(ok(campo({ tipo: 'DATA' }), '28/02/2026')).toBe(false)
    expect(ok(campo({ tipo: 'DATA' }), '2026-13-40')).toBe(false)
    expect(ok(campo({ tipo: 'HORA' }), '23:59')).toBe(true)
    expect(ok(campo({ tipo: 'HORA' }), '24:00')).toBe(false)
    expect(ok(campo({ tipo: 'DATA_HORA' }), '2026-02-28T10:00:00-03:00')).toBe(true)
    expect(ok(campo({ tipo: 'DATA_HORA' }), '2026-02-28 10:00')).toBe(false)
  })
  it('CHECKBOX aceita só booleano', () => {
    expect(ok(campo({ tipo: 'CHECKBOX' }), false)).toBe(true)
    expect(ok(campo({ tipo: 'CHECKBOX' }), 'sim')).toBe(false)
  })
  it('obrigatório exige valor; opcional aceita ausência', () => {
    expect(ok(campo({ tipo: 'TEXTO', obrigatorio: true }), undefined)).toBe(false)
    expect(ok(campo({ tipo: 'TEXTO', obrigatorio: true }), '  ')).toBe(false)
    expect(ok(campo({ tipo: 'TEXTO', obrigatorio: true }), 'ok')).toBe(true)
    expect(ok(campo({ tipo: 'SELECAO_MULTIPLA', opcoes: ['a'], obrigatorio: true }), [])).toBe(false)
    expect(ok(campo({ tipo: 'TEXTO' }), undefined)).toBe(true)
  })
  it('chave desconhecida é recusada e SO_EDICAO não existe na abertura', () => {
    const c = campo({ tipo: 'TEXTO', visibilidade: 'SO_EDICAO' })
    expect(schemaDosCampos([c], 'abertura').safeParse({ x: 'a' }).success).toBe(false)
    expect(ok(c, 'a', 'edicao')).toBe(true)
    expect(schemaDosCampos([campo({ tipo: 'TEXTO' })], 'abertura').safeParse({ y: 'a' }).success).toBe(false)
  })
})

describe('CriarCampoPersonalizadoSchema', () => {
  const base = {
    chave: 'codigo_bem',
    rotulo: 'Código',
    tipo: 'TEXTO',
    opcoes: [],
    obrigatorio: false,
    regex: null,
    ajuda: null,
    visibilidade: 'ABERTURA',
    ordem: 0,
    ativo: true,
    problemas: [],
  }
  it('aceita o corpo válido', () => {
    expect(CriarCampoPersonalizadoSchema.safeParse(base).success).toBe(true)
  })
  it('seleção sem opções, regex inválida e chave inválida dão erro', () => {
    expect(CriarCampoPersonalizadoSchema.safeParse({ ...base, tipo: 'SELECAO' }).success).toBe(false)
    expect(CriarCampoPersonalizadoSchema.safeParse({ ...base, regex: '(' }).success).toBe(false)
    expect(CriarCampoPersonalizadoSchema.safeParse({ ...base, chave: 'Codigo' }).success).toBe(false)
    expect(CriarCampoPersonalizadoSchema.safeParse({ ...base, opcoes: ['a'] }).success).toBe(false)
  })
})
