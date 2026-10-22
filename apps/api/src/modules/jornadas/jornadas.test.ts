import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { filasEmMemoria, limparFilaMemoria } from '../../lib/filas'
import { prisma } from '../../lib/prisma'

describe('módulo jornadas', () => {
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

  const corpo = {
    nome: 'Turno Teste',
    timezone: 'America/Sao_Paulo',
    ininterrupta: false,
    ativo: true,
    horarios: [
      { diaSemana: 1, inicioMin: 480, fimMin: 1080 },
      { diaSemana: 2, inicioMin: 480, fimMin: 1080 },
    ],
  }

  async function criarJornadaNoBanco(nome: string): Promise<number> {
    const j = await prisma.jornada.create({ data: { nome, ininterrupta: true }, select: { id: true } })
    return j.id
  }

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/jornadas' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const headers = await headersDe(u.id)
      const lista = await app.inject({ method: 'GET', url: '/api/v1/jornadas', headers })
      expect(lista.statusCode).toBe(403)
      expect(lista.json().erro.codigo).toBe('SEM_PERMISSAO')
      const criar = await app.inject({ method: 'POST', url: '/api/v1/jornadas', headers, payload: corpo })
      expect(criar.statusCode).toBe(403)
    }
  })

  it('ADMIN cria com horários, audita, lista e obtém; 404 para id inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const criada = await app.inject({ method: 'POST', url: '/api/v1/jornadas', headers, payload: corpo })
    expect(criada.statusCode).toBe(201)
    expect(criada.json()).toEqual({
      id: expect.any(Number),
      nome: 'Turno Teste',
      timezone: 'America/Sao_Paulo',
      ininterrupta: false,
      ativo: true,
      horarios: corpo.horarios,
      criadoEm: expect.any(String),
      atualizadoEm: expect.any(String),
    })
    const id = criada.json().id as number
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'jornada' } })).toBe(1)

    const lista = await app.inject({ method: 'GET', url: '/api/v1/jornadas', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 1, itens: [{ id, nome: 'Turno Teste' }] })

    const obtida = await app.inject({ method: 'GET', url: `/api/v1/jornadas/${id}`, headers })
    expect(obtida.statusCode).toBe(200)
    expect(obtida.json()).toMatchObject({ id, horarios: corpo.horarios })

    const inexistente = await app.inject({ method: 'GET', url: '/api/v1/jornadas/999999', headers })
    expect(inexistente.statusCode).toBe(404)
    expect(inexistente.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('400 com detalhes: sobreposição, fim antes do início, fuso inválido, sem horário e chave extra', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const sobreposta = await app.inject({
      method: 'POST',
      url: '/api/v1/jornadas',
      headers,
      payload: {
        ...corpo,
        horarios: [
          { diaSemana: 1, inicioMin: 480, fimMin: 720 },
          { diaSemana: 1, inicioMin: 600, fimMin: 1080 },
        ],
      },
    })
    expect(sobreposta.statusCode).toBe(400)
    expect(sobreposta.json().erro.codigo).toBe('VALIDACAO')
    expect(sobreposta.json().erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'horarios' })]),
    )

    const fimAntes = await app.inject({
      method: 'POST',
      url: '/api/v1/jornadas',
      headers,
      payload: { ...corpo, horarios: [{ diaSemana: 1, inicioMin: 600, fimMin: 600 }] },
    })
    expect(fimAntes.statusCode).toBe(400)
    expect(fimAntes.json().erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: expect.stringContaining('horarios') })]),
    )

    const fusoInvalido = await app.inject({
      method: 'POST',
      url: '/api/v1/jornadas',
      headers,
      payload: { ...corpo, timezone: 'Mars/Olympus' },
    })
    expect(fusoInvalido.statusCode).toBe(400)
    expect(fusoInvalido.json().erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'timezone' })]),
    )

    const semHorario = await app.inject({
      method: 'POST',
      url: '/api/v1/jornadas',
      headers,
      payload: { ...corpo, horarios: [] },
    })
    expect(semHorario.statusCode).toBe(400)
    expect(semHorario.json().erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'horarios' })]),
    )

    const extra = await app.inject({
      method: 'POST',
      url: '/api/v1/jornadas',
      headers,
      payload: { ...corpo, perfil: 'ADMIN' },
    })
    expect(extra.statusCode).toBe(400)
    expect(await prisma.jornada.count()).toBe(0)
  })

  it('409 ao criar com nome repetido', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    await app.inject({ method: 'POST', url: '/api/v1/jornadas', headers, payload: corpo })
    const duplicada = await app.inject({ method: 'POST', url: '/api/v1/jornadas', headers, payload: corpo })
    expect(duplicada.statusCode).toBe(409)
    expect(duplicada.json().erro.codigo).toBe('CONFLITO')
  })

  it('PUT troca todos os horários, audita e enfileira o recálculo do SLA depois do commit', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const criada = await app.inject({ method: 'POST', url: '/api/v1/jornadas', headers, payload: corpo })
    const id = criada.json().id as number
    limparFilaMemoria()

    const novo = {
      ...corpo,
      nome: 'Turno Noturno',
      horarios: [{ diaSemana: 5, inicioMin: 1200, fimMin: 1440 }],
    }
    const res = await app.inject({ method: 'PUT', url: `/api/v1/jornadas/${id}`, headers, payload: novo })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id, nome: 'Turno Noturno', horarios: novo.horarios })
    expect(await prisma.jornadaHorario.count({ where: { jornadaId: id } })).toBe(1)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.alterado', entidade: 'jornada' } })).toBe(1)
    expect(filasEmMemoria.enviados).toEqual([
      { fila: 'sla-recalcular-jornada', dados: { jornadaId: id }, opcoes: undefined },
    ])

    const sobreposta = await app.inject({
      method: 'PUT',
      url: `/api/v1/jornadas/${id}`,
      headers,
      payload: {
        ...novo,
        horarios: [
          { diaSemana: 1, inicioMin: 480, fimMin: 720 },
          { diaSemana: 1, inicioMin: 700, fimMin: 900 },
        ],
      },
    })
    expect(sobreposta.statusCode).toBe(400)
    expect(sobreposta.json().erro.detalhes).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: 'horarios' })]),
    )
    expect(filasEmMemoria.enviados).toHaveLength(1)

    const inexistente = await app.inject({ method: 'PUT', url: '/api/v1/jornadas/999999', headers, payload: novo })
    expect(inexistente.statusCode).toBe(404)
    expect(filasEmMemoria.enviados).toHaveLength(1)
  })

  it('DELETE: 204 quando livre; 409 REGISTRO_EM_USO por área, por chamado e por jornada padrão do SLA', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const livre = await criarJornadaNoBanco('Livre')
    const ok = await app.inject({ method: 'DELETE', url: `/api/v1/jornadas/${livre}`, headers })
    expect(ok.statusCode).toBe(204)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.excluido', entidade: 'jornada' } })).toBe(1)

    const porArea = await criarJornadaNoBanco('Da área')
    await prisma.area.create({ data: { nome: 'Área com jornada', jornadaId: porArea }, select: { id: true } })
    const areaEmUso = await app.inject({ method: 'DELETE', url: `/api/v1/jornadas/${porArea}`, headers })
    expect(areaEmUso.statusCode).toBe(409)
    expect(areaEmUso.json().erro.codigo).toBe('REGISTRO_EM_USO')

    const porChamado = await criarJornadaNoBanco('Do chamado')
    const area = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO', areaId: area.id })
    await criarChamado({ solicitanteId: solicitante.id, areaId: area.id, jornadaId: porChamado })
    const chamadoEmUso = await app.inject({ method: 'DELETE', url: `/api/v1/jornadas/${porChamado}`, headers })
    expect(chamadoEmUso.statusCode).toBe(409)
    expect(chamadoEmUso.json().erro.codigo).toBe('REGISTRO_EM_USO')

    const padrao = await criarJornadaNoBanco('Padrão do SLA')
    await prisma.config.upsert({
      where: { chave: 'sla.jornadaPadraoId' },
      create: { chave: 'sla.jornadaPadraoId', valor: padrao },
      update: { valor: padrao },
    })
    const padraoEmUso = await app.inject({ method: 'DELETE', url: `/api/v1/jornadas/${padrao}`, headers })
    expect(padraoEmUso.statusCode).toBe(409)
    expect(padraoEmUso.json().erro.codigo).toBe('REGISTRO_EM_USO')
    expect(await prisma.jornada.count({ where: { id: padrao } })).toBe(1)

    const inexistente = await app.inject({ method: 'DELETE', url: '/api/v1/jornadas/999999', headers })
    expect(inexistente.statusCode).toBe(404)
  })
})
