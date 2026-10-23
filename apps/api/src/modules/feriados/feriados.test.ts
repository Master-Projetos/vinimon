import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { filasEmMemoria, limparFilaMemoria } from '../../lib/filas'
import { prisma } from '../../lib/prisma'

describe('módulo feriados', () => {
  let app: App

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
    limparFilaMemoria()
  })

  const corpo = { data: '2026-12-25', nome: 'Natal', recorrente: true, jornadaId: null }

  async function criarJornadaNoBanco(nome: string, ativo = true): Promise<number> {
    const j = await prisma.jornada.create({ data: { nome, ininterrupta: true, ativo }, select: { id: true } })
    return j.id
  }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/feriados' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const headers = await headersDe(u.id)
      const lista = await app.inject({ method: 'GET', url: '/api/v1/feriados', headers })
      expect(lista.statusCode).toBe(403)
      expect(lista.json().erro.codigo).toBe('SEM_PERMISSAO')
      const criar = await app.inject({ method: 'POST', url: '/api/v1/feriados', headers, payload: corpo })
      expect(criar.statusCode).toBe(403)
    }
  })

  it('400 com detalhes: data fora do formato, nome vazio, nome longo e chave extra', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const dataInvalida = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados',
      headers,
      payload: { ...corpo, data: '25/12/2026' },
    })
    expect(dataInvalida.statusCode).toBe(400)
    expect(dataInvalida.json().erro.codigo).toBe('VALIDACAO')
    expect(dataInvalida.json().erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'data' })]),
    )

    const nomeVazio = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados',
      headers,
      payload: { ...corpo, nome: '   ' },
    })
    expect(nomeVazio.statusCode).toBe(400)
    expect(nomeVazio.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nome' })]))

    const nomeLongo = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados',
      headers,
      payload: { ...corpo, nome: 'x'.repeat(121) },
    })
    expect(nomeLongo.statusCode).toBe(400)
    expect(nomeLongo.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'nome' })]))

    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados',
      headers,
      payload: { ...corpo, perfil: 'ADMIN' },
    })
    expect(extra.statusCode).toBe(400)
    expect(await prisma.feriado.count()).toBe(0)
    expect(filasEmMemoria.enviados).toHaveLength(0)
  })

  it('ADMIN cria recorrente gravado em 2000 (volta como 2000-12-25), audita e obtém', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const criado = await app.inject({ method: 'POST', url: '/api/v1/feriados', headers, payload: corpo })
    expect(criado.statusCode).toBe(201)
    expect(criado.json()).toEqual({
      id: expect.any(Number),
      data: '2000-12-25',
      nome: 'Natal',
      recorrente: true,
      jornadaId: null,
      criadoEm: expect.any(String),
    })
    const id = criado.json().id as number
    expect((await prisma.feriado.findUniqueOrThrow({ where: { id } })).data.toISOString().slice(0, 10)).toBe(
      '2000-12-25',
    )
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'feriado' } })).toBe(1)

    const obtido = await app.inject({ method: 'GET', url: `/api/v1/feriados/${id}`, headers })
    expect(obtido.statusCode).toBe(200)
    expect(obtido.json()).toMatchObject({ id, data: '2000-12-25', recorrente: true })

    const inexistente = await app.inject({ method: 'GET', url: '/api/v1/feriados/999999', headers })
    expect(inexistente.statusCode).toBe(404)
    expect(inexistente.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('não recorrente mantém o ano; 422 REFERENCIA_INVALIDA para jornada inexistente, sem gravar nem enfileirar', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const jornada = await criarJornadaNoBanco('Comercial')
    limparFilaMemoria()

    const pontual = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados',
      headers,
      payload: { data: '2026-10-30', nome: 'Pontual', recorrente: false, jornadaId: jornada },
    })
    expect(pontual.statusCode).toBe(201)
    expect(pontual.json()).toMatchObject({ data: '2026-10-30', recorrente: false, jornadaId: jornada })
    expect(filasEmMemoria.enviados).toEqual([
      { fila: 'sla-recalcular-jornada', dados: { jornadaId: jornada }, opcoes: undefined },
    ])

    const semJornada = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados',
      headers,
      payload: { ...corpo, jornadaId: 999999 },
    })
    expect(semJornada.statusCode).toBe(422)
    expect(semJornada.json().erro.codigo).toBe('REFERENCIA_INVALIDA')
    expect(await prisma.feriado.count()).toBe(1)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'feriado' } })).toBe(1)
    expect(filasEmMemoria.enviados).toHaveLength(1)
  })

  it('lista com ano: recorrentes sempre entram; não recorrentes filtram pelo ano da data', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    await app.inject({ method: 'POST', url: '/api/v1/feriados', headers, payload: corpo })
    await app.inject({
      method: 'POST',
      url: '/api/v1/feriados',
      headers,
      payload: { data: '2026-10-30', nome: 'Pontual 2026', recorrente: false, jornadaId: null },
    })
    await app.inject({
      method: 'POST',
      url: '/api/v1/feriados',
      headers,
      payload: { data: '2027-01-01', nome: 'Pontual 2027', recorrente: false, jornadaId: null },
    })

    const de2026 = await app.inject({ method: 'GET', url: '/api/v1/feriados?ano=2026', headers })
    expect(de2026.statusCode).toBe(200)
    expect(de2026.json()).toMatchObject({ total: 2 })
    expect(de2026.json().itens.map((f: { nome: string }) => f.nome)).toEqual(['Natal', 'Pontual 2026'])

    const todos = await app.inject({ method: 'GET', url: '/api/v1/feriados', headers })
    expect(todos.json()).toMatchObject({ total: 3 })

    const semRegistro = await app.inject({ method: 'GET', url: '/api/v1/feriados?ano=2030', headers })
    expect(semRegistro.json()).toMatchObject({ total: 1, itens: [{ nome: 'Natal' }] })
  })

  it('PUT troca o feriado, audita e recalcula a jornada antiga e a nova', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const antiga = await criarJornadaNoBanco('Antiga')
    const nova = await criarJornadaNoBanco('Nova')
    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados',
      headers,
      payload: { data: '2026-10-30', nome: 'Pontual', recorrente: false, jornadaId: antiga },
    })
    const id = criado.json().id as number
    limparFilaMemoria()

    const atualizado = { data: '2026-11-02', nome: 'Finados', recorrente: false, jornadaId: nova }
    const res = await app.inject({ method: 'PUT', url: `/api/v1/feriados/${id}`, headers, payload: atualizado })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id, ...atualizado })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.alterado', entidade: 'feriado' } })).toBe(1)
    expect(filasEmMemoria.enviados.map((e) => e.dados)).toEqual([{ jornadaId: antiga }, { jornadaId: nova }])

    const inexistente = await app.inject({
      method: 'PUT',
      url: '/api/v1/feriados/999999',
      headers,
      payload: atualizado,
    })
    expect(inexistente.statusCode).toBe(404)
    expect(filasEmMemoria.enviados).toHaveLength(2)
  })

  it('DELETE: 204 e recálculo da jornada; 404 para id inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const jornada = await criarJornadaNoBanco('Da jornada')
    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/feriados',
      headers,
      payload: { data: '2026-10-30', nome: 'Pontual', recorrente: false, jornadaId: jornada },
    })
    const id = criado.json().id as number
    limparFilaMemoria()

    const ok = await app.inject({ method: 'DELETE', url: `/api/v1/feriados/${id}`, headers })
    expect(ok.statusCode).toBe(204)
    expect(await prisma.feriado.count({ where: { id } })).toBe(0)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'feriado' } })).toBe(1)
    expect(filasEmMemoria.enviados).toEqual([
      { fila: 'sla-recalcular-jornada', dados: { jornadaId: jornada }, opcoes: undefined },
    ])

    const inexistente = await app.inject({ method: 'DELETE', url: '/api/v1/feriados/999999', headers })
    expect(inexistente.statusCode).toBe(404)
    expect(filasEmMemoria.enviados).toHaveLength(1)
  })

  it('jornadaId=null enfileira o recálculo de cada jornada ativa (não das inativas)', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const ativa1 = await criarJornadaNoBanco('Ativa 1')
    const ativa2 = await criarJornadaNoBanco('Ativa 2')
    await criarJornadaNoBanco('Inativa', false)
    limparFilaMemoria()

    const res = await app.inject({ method: 'POST', url: '/api/v1/feriados', headers, payload: corpo })
    expect(res.statusCode).toBe(201)
    expect(filasEmMemoria.enviados).toEqual([
      { fila: 'sla-recalcular-jornada', dados: { jornadaId: ativa1 }, opcoes: undefined },
      { fila: 'sla-recalcular-jornada', dados: { jornadaId: ativa2 }, opcoes: undefined },
    ])
  })
})
