import type { Assentamento } from '@vinimon/shared'
import { describe, expect, it } from 'vitest'
import {
  atualizarItem,
  type ItemConversa,
  mesclarAssentamento,
  type PaginaConversa,
  removerPendente,
  temPendente,
} from './cache'

const AUTOR = { id: 7, nome: 'Ana Souza' }

function item(id: number, extra: Partial<ItemConversa> = {}): ItemConversa {
  const base: Assentamento = {
    id,
    chamadoId: 5,
    tipo: 'COMENTARIO',
    interno: false,
    texto: `mensagem ${id}`,
    evento: null,
    dados: null,
    autor: AUTOR,
    criadoEm: new Date('2026-10-01T13:00:00.000Z'),
    clienteId: null,
  }
  return { ...base, ...extra }
}

const pendente = (clienteId: string, texto = 'enviando') => item(-1, { estado: 'enviando', clienteId, texto })

const ids = (paginas: PaginaConversa[]) => paginas.flatMap((p) => p.itens.map((i) => i.id))

describe('mesclarAssentamento', () => {
  it('insere na página mais recente, em ordem de id', () => {
    const paginas: PaginaConversa[] = [
      { itens: [item(10), item(12)], proximoCursor: 10 },
      { itens: [item(3)], proximoCursor: null },
    ]
    const novo = mesclarAssentamento(paginas, item(11))
    expect(novo[0]?.itens.map((i) => i.id)).toEqual([10, 11, 12])
    expect(novo[1]?.itens.map((i) => i.id)).toEqual([3])
  })

  it('se o id já existe, substitui no lugar (em qualquer página)', () => {
    const paginas: PaginaConversa[] = [
      { itens: [item(10)], proximoCursor: 10 },
      { itens: [item(3), item(4)], proximoCursor: null },
    ]
    const novo = mesclarAssentamento(paginas, item(4, { texto: 'editada' }))
    expect(novo[1]?.itens.map((i) => i.texto)).toEqual(['mensagem 3', 'editada'])
    expect(ids(novo)).toEqual([10, 3, 4])
  })

  it('se o clienteId é de uma mensagem pendente, substitui a pendente', () => {
    const paginas: PaginaConversa[] = [{ itens: [item(10), pendente('abc')], proximoCursor: null }]
    const novo = mesclarAssentamento(paginas, item(11, { clienteId: 'abc', texto: 'confirmada' }))
    expect(novo[0]?.itens).toHaveLength(2)
    expect(novo[0]?.itens.at(-1)).toMatchObject({ id: 11, texto: 'confirmada' })
    expect(novo[0]?.itens.at(-1)?.estado).toBeUndefined()
  })

  it('pendentes ficam no fim, mesmo depois de chegarem mensagens de outras pessoas', () => {
    const paginas: PaginaConversa[] = [{ itens: [item(10), pendente('abc')], proximoCursor: null }]
    const novo = mesclarAssentamento(paginas, item(11, { autor: { id: 8, nome: 'Bruno' } }))
    expect(novo[0]?.itens.map((i) => [i.id, i.estado])).toEqual([
      [10, undefined],
      [11, undefined],
      [-1, 'enviando'],
    ])
  })

  it('o clienteId de outra mensagem confirmada não troca a pendente de outro envio', () => {
    const paginas: PaginaConversa[] = [{ itens: [pendente('abc')], proximoCursor: null }]
    const novo = mesclarAssentamento(paginas, item(11, { clienteId: 'outro' }))
    expect(novo[0]?.itens).toHaveLength(2)
    expect(temPendente(novo, 'abc')).toBe(true)
  })

  it('sem páginas, cria a primeira', () => {
    expect(mesclarAssentamento([], item(1))).toEqual([{ itens: [item(1)], proximoCursor: null }])
  })

  it('não altera o array original', () => {
    const paginas: PaginaConversa[] = [{ itens: [item(10)], proximoCursor: null }]
    mesclarAssentamento(paginas, item(11))
    expect(paginas[0]?.itens).toHaveLength(1)
  })
})

describe('atualizarItem, removerPendente e temPendente', () => {
  it('marca a pendente como falhou e depois a remove (descartar)', () => {
    let paginas: PaginaConversa[] = [{ itens: [item(10), pendente('abc')], proximoCursor: null }]
    paginas = atualizarItem(paginas, (i) => i.clienteId === 'abc', {
      estado: 'falhou',
      erro: 'Sem conexão com o servidor.',
    })
    expect(paginas[0]?.itens.at(-1)).toMatchObject({ estado: 'falhou', erro: 'Sem conexão com o servidor.' })
    expect(temPendente(paginas, 'abc')).toBe(true)
    paginas = removerPendente(paginas, 'abc')
    expect(ids(paginas)).toEqual([10])
    expect(temPendente(paginas, 'abc')).toBe(false)
  })

  it('removerPendente não apaga uma mensagem confirmada com o mesmo clienteId', () => {
    const paginas: PaginaConversa[] = [{ itens: [item(10, { clienteId: 'abc' })], proximoCursor: null }]
    expect(ids(removerPendente(paginas, 'abc'))).toEqual([10])
  })
})
