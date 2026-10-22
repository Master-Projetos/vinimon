import { afterEach, describe, expect, it } from 'vitest'
import { gravar, ler, limparDadosDoUsuario, remover } from './storage'

const chavesDeTeste = ['tema', 'densidade', 'painel', 'u7:recentes']

describe('storage', () => {
  afterEach(() => {
    for (const chave of chavesDeTeste) remover(chave)
  })

  it('ler devolve o padrão quando a chave não existe', () => {
    expect(ler('tema', 'claro')).toBe('claro')
  })

  it('gravar e ler guardam o valor e devolvem o mesmo objeto', () => {
    gravar('densidade', { modo: 'compacta', colunas: 3 })

    expect(ler('densidade', null)).toEqual({ modo: 'compacta', colunas: 3 })
  })

  it('remover apaga só a chave indicada', () => {
    gravar('tema', 'escuro')
    gravar('painel', true)

    remover('tema')

    expect(ler('tema', 'padrao')).toBe('padrao')
    expect(ler('painel', false)).toBe(true)
  })

  it('limparDadosDoUsuario() remove vinimon:u7:recentes e mantém vinimon:tema', () => {
    gravar('u7:recentes', [1, 2, 3])
    gravar('tema', 'escuro')

    limparDadosDoUsuario()

    expect(ler<number[] | null>('u7:recentes', null)).toBeNull()
    expect(ler('tema', 'claro')).toBe('escuro')
  })
})
