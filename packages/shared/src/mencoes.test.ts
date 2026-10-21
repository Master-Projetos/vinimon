import { describe, expect, it } from 'vitest'
import {
  criarMencaoRe,
  extrairMencoes,
  segmentarTexto,
  serializarComposer,
  serializarMencao,
  textoPlano,
} from './mencoes'

describe('criarMencaoRe', () => {
  it('devolve uma instância nova a cada chamada', () => {
    expect(criarMencaoRe()).not.toBe(criarMencaoRe())
  })
})

describe('serializarMencao e extrairMencoes', () => {
  it('ida e volta preserva id e nome', () => {
    const token = serializarMencao({ id: 42, nome: 'Ana Souza' })
    expect(token).toBe('@[Ana Souza](usuario:42)')
    expect(extrairMencoes(`oi ${token}!`)).toEqual([{ id: 42, nome: 'Ana Souza' }])
  })

  it('remove []() e quebras de linha do nome', () => {
    expect(serializarMencao({ id: 1, nome: 'A[b]c(d)\ne' })).toBe('@[Abcde](usuario:1)')
  })

  it('corta o nome em 80 caracteres', () => {
    const token = serializarMencao({ id: 1, nome: 'x'.repeat(100) })
    expect(extrairMencoes(token)).toEqual([{ id: 1, nome: 'x'.repeat(80) }])
  })

  it('não repete o mesmo id e mantém a ordem de aparição', () => {
    const texto = '@[Bia](usuario:2) @[Ana](usuario:1) @[Bia](usuario:2)'
    expect(extrairMencoes(texto)).toEqual([
      { id: 2, nome: 'Bia' },
      { id: 1, nome: 'Ana' },
    ])
  })
})

describe('textoPlano', () => {
  it('troca tokens por @Nome', () => {
    expect(textoPlano('Oi @[Ana Souza](usuario:42), veja')).toBe('Oi @Ana Souza, veja')
  })
})

describe('segmentarTexto', () => {
  it('separa texto, menção e link', () => {
    expect(segmentarTexto('veja https://exemplo.com/a e @[Ana](usuario:1)')).toEqual([
      { tipo: 'texto', valor: 'veja ' },
      { tipo: 'link', href: 'https://exemplo.com/a' },
      { tipo: 'texto', valor: ' e ' },
      { tipo: 'mencao', id: 1, nome: 'Ana' },
    ])
  })

  it('<script> continua texto', () => {
    expect(segmentarTexto('<script>alert(1)</script>')).toEqual([{ tipo: 'texto', valor: '<script>alert(1)</script>' }])
  })

  it('javascript: não vira link', () => {
    expect(segmentarTexto('javascript:alert(1)')).toEqual([{ tipo: 'texto', valor: 'javascript:alert(1)' }])
  })

  it('deixa a pontuação final de fora do link', () => {
    expect(segmentarTexto('ver https://exemplo.com.')).toEqual([
      { tipo: 'texto', valor: 'ver ' },
      { tipo: 'link', href: 'https://exemplo.com' },
      { tipo: 'texto', valor: '.' },
    ])
  })
})

describe('serializarComposer', () => {
  it('troca o @Nome visível pelo token da menção selecionada', () => {
    expect(serializarComposer('Oi @Ana, tudo bem?', [{ id: 1, nome: 'Ana' }])).toBe('Oi @[Ana](usuario:1), tudo bem?')
  })

  it('ignora menção que o usuário apagou do texto', () => {
    expect(serializarComposer('Oi', [{ id: 1, nome: 'Ana' }])).toBe('Oi')
  })

  it('não interpreta $ no nome como padrão de substituição', () => {
    expect(serializarComposer('@A$&', [{ id: 1, nome: 'A$&' }])).toBe('@[A$&](usuario:1)')
  })
})
