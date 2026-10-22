import { contrato, zDataHora } from '@vinimon/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chamar, definirCsrf, definirRenovadorCsrf, ErroApi } from './api'

const lerItem = contrato({
  metodo: 'GET',
  caminho: '/itens/:id',
  params: z.object({ id: z.string() }),
  resposta: z.object({ nome: z.string(), criadoEm: zDataHora() }),
})

const criarItem = contrato({
  metodo: 'POST',
  caminho: '/itens',
  body: z.object({ nome: z.string() }),
  resposta: z.object({ id: z.number() }),
  status: 201,
})

const json = (corpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

const erroCorpo = (codigo: string, mensagem: string, detalhes?: { campo: string; mensagem: string }[]) => ({
  erro: { codigo, mensagem, ...(detalhes ? { detalhes } : {}) },
})

const cabecalhosDaChamada = (chamadas: unknown[][], indice: number): Record<string, string> => {
  const init = chamadas[indice]?.[1] as RequestInit | undefined
  return (init?.headers ?? {}) as Record<string, string>
}

describe('chamar()', () => {
  const fetchSimulado = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

  beforeEach(() => {
    fetchSimulado.mockReset()
    vi.stubGlobal('fetch', fetchSimulado)
    definirCsrf(null)
    definirRenovadorCsrf(async () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('200: faz parse da resposta e converte datas em Date', async () => {
    fetchSimulado.mockResolvedValueOnce(json({ nome: 'Chamado 1', criadoEm: '2026-01-02T03:04:05.000Z' }))

    const resultado = await chamar(lerItem, { params: { id: '7' } })

    expect(resultado.nome).toBe('Chamado 1')
    expect(resultado.criadoEm).toBeInstanceOf(Date)
    expect(resultado.criadoEm.toISOString()).toBe('2026-01-02T03:04:05.000Z')
    expect(fetchSimulado.mock.calls[0]?.[0]).toBe('/api/v1/itens/7')
  })

  it('204: devolve undefined sem tentar ler o corpo', async () => {
    fetchSimulado.mockResolvedValueOnce(new Response(null, { status: 204 }))

    const resultado = await chamar(lerItem, { params: { id: '7' } })

    expect(resultado).toBeUndefined()
  })

  it('400: lança ErroApi com os detalhes por campo', async () => {
    fetchSimulado.mockResolvedValueOnce(
      json(erroCorpo('VALIDACAO', 'Dados inválidos.', [{ campo: 'nome', mensagem: 'Obrigatório.' }]), 400),
    )

    const erro = await chamar(criarItem, { body: { nome: '' } }).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(ErroApi)
    expect(erro).toMatchObject({
      status: 400,
      codigo: 'VALIDACAO',
      detalhes: [{ campo: 'nome', mensagem: 'Obrigatório.' }],
    })
  })

  it('401: lança ErroApi com status 401', async () => {
    fetchSimulado.mockResolvedValueOnce(json(erroCorpo('NAO_AUTENTICADO', 'Entre para continuar.'), 401))

    const erro = await chamar(lerItem, { params: { id: '7' } }).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(ErroApi)
    expect(erro).toMatchObject({ status: 401, codigo: 'NAO_AUTENTICADO' })
  })

  it('rede: falha de conexão vira ErroApi com status 0 e código REDE', async () => {
    fetchSimulado.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const erro = await chamar(lerItem, { params: { id: '7' } }).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(ErroApi)
    expect(erro).toMatchObject({ status: 0, codigo: 'REDE' })
  })

  it('CSRF_INVALIDO: renova o token e repete a chamada uma vez', async () => {
    const renovar = vi.fn(async () => {
      definirCsrf('token-novo')
    })
    definirRenovadorCsrf(renovar)
    definirCsrf('token-antigo')
    fetchSimulado
      .mockResolvedValueOnce(json(erroCorpo('CSRF_INVALIDO', 'Token CSRF inválido.'), 403))
      .mockResolvedValueOnce(json({ id: 3 }, 201))

    const resultado = await chamar(criarItem, { body: { nome: 'x' } })

    expect(resultado).toEqual({ id: 3 })
    expect(renovar).toHaveBeenCalledTimes(1)
    expect(fetchSimulado).toHaveBeenCalledTimes(2)
    expect(cabecalhosDaChamada(fetchSimulado.mock.calls, 0)['x-csrf-token']).toBe('token-antigo')
    expect(cabecalhosDaChamada(fetchSimulado.mock.calls, 1)['x-csrf-token']).toBe('token-novo')
  })

  it('CSRF_INVALIDO de novo na repetição: não tenta uma terceira vez', async () => {
    const renovar = vi.fn(async () => {
      definirCsrf('token-novo')
    })
    definirRenovadorCsrf(renovar)
    definirCsrf('token-antigo')
    fetchSimulado
      .mockResolvedValueOnce(json(erroCorpo('CSRF_INVALIDO', 'Token CSRF inválido.'), 403))
      .mockResolvedValueOnce(json(erroCorpo('CSRF_INVALIDO', 'Token CSRF inválido.'), 403))

    const erro = await chamar(criarItem, { body: { nome: 'x' } }).catch((e: unknown) => e)

    expect(erro).toMatchObject({ status: 403, codigo: 'CSRF_INVALIDO' })
    expect(renovar).toHaveBeenCalledTimes(1)
    expect(fetchSimulado).toHaveBeenCalledTimes(2)
  })
})
