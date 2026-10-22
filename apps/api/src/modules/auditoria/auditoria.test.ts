import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../../lib/prisma'

const DIA = 86_400_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('módulo auditoria', () => {
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
  })

  const linha = (d: Prisma.AuditoriaUncheckedCreateInput) => prisma.auditoria.create({ data: d, select: { id: true } })

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auditoria' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('403 para USUARIO e OPERADOR (sem auditoria.ver)', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({ method: 'GET', url: '/api/v1/auditoria', headers: await headersDe(u.id) })
      expect(res.statusCode).toBe(403)
      expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
    }
  })

  it('400 com detalhes para filtro inválido, chave desconhecida e período acima de 366 dias', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)

    const atorInvalido = await app.inject({ method: 'GET', url: '/api/v1/auditoria?atorId=abc', headers })
    expect(atorInvalido.statusCode).toBe(400)
    expect(atorInvalido.json().erro.codigo).toBe('VALIDACAO')
    expect(atorInvalido.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'atorId' })])

    const extra = await app.inject({ method: 'GET', url: '/api/v1/auditoria?perfil=ADMIN', headers })
    expect(extra.statusCode).toBe(400)

    const agora = Date.now()
    const de = new Date(agora - 400 * DIA).toISOString()
    const ate = new Date(agora).toISOString()
    const longo = await app.inject({ method: 'GET', url: `/api/v1/auditoria?de=${de}&ate=${ate}`, headers })
    expect(longo.statusCode).toBe(400)
    expect(longo.json().erro.codigo).toBe('VALIDACAO')
    expect(longo.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'de' })])

    const invertido = await app.inject({
      method: 'GET',
      url: `/api/v1/auditoria?de=${ate}&ate=${de}`,
      headers,
    })
    expect(invertido.statusCode).toBe(400)
    expect(invertido.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'de' })])
  })

  it('lista com filtros, ordem criadoEm desc e id desc, ator e paginação', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const outro = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const agora = Date.now()

    const a = await linha({
      atorTipo: 'USUARIO',
      atorId: admin.id,
      acao: 'cadastro.criado',
      entidade: 'area',
      entidadeId: '1',
      criadoEm: new Date(agora - 1 * 3_600_000),
    })
    // mesmo instante que `a`, id maior: deve vir antes de `a` (desempate por id desc)
    const e = await linha({
      atorTipo: 'USUARIO',
      atorId: admin.id,
      acao: 'cadastro.alterado',
      entidade: 'area',
      entidadeId: '1',
      criadoEm: new Date(agora - 1 * 3_600_000),
    })
    const b = await linha({
      atorTipo: 'USUARIO',
      atorId: admin.id,
      acao: 'cadastro.alterado',
      entidade: 'area',
      entidadeId: '1',
      criadoEm: new Date(agora - 2 * 3_600_000),
    })
    const c = await linha({
      atorTipo: 'USUARIO',
      atorId: outro.id,
      acao: 'cadastro.criado',
      entidade: 'tag',
      entidadeId: '9',
      criadoEm: new Date(agora - 3 * 3_600_000),
    })
    const d = await linha({
      atorTipo: 'SISTEMA',
      atorId: null,
      acao: 'login.falha',
      entidade: 'usuario',
      entidadeId: null,
      criadoEm: new Date(agora - 40 * DIA),
    })
    const ids = (itens: { id: number }[]) => itens.map((i) => i.id)

    const padrao = await app.inject({ method: 'GET', url: '/api/v1/auditoria', headers })
    expect(padrao.statusCode).toBe(200)
    expect(padrao.json()).toMatchObject({ total: 4, pagina: 1, porPagina: 25 })
    expect(ids(padrao.json().itens)).toEqual([e.id, a.id, b.id, c.id])
    expect(padrao.json().itens[0]).toMatchObject({
      atorTipo: 'USUARIO',
      ator: { id: admin.id, nome: expect.any(String) },
      acao: 'cadastro.alterado',
      entidade: 'area',
      entidadeId: '1',
      dados: null,
    })

    const porAtor = await app.inject({ method: 'GET', url: `/api/v1/auditoria?atorId=${outro.id}`, headers })
    expect(ids(porAtor.json().itens)).toEqual([c.id])

    const porAcao = await app.inject({ method: 'GET', url: '/api/v1/auditoria?acao=cadastro.criado', headers })
    expect(ids(porAcao.json().itens)).toEqual([a.id, c.id])

    const porEntidade = await app.inject({
      method: 'GET',
      url: '/api/v1/auditoria?entidade=area&entidadeId=1&atorId=' + admin.id,
      headers,
    })
    expect(ids(porEntidade.json().itens)).toEqual([e.id, a.id, b.id])

    const semAtor = await app.inject({
      method: 'GET',
      url: `/api/v1/auditoria?de=${new Date(agora - 60 * DIA).toISOString()}&ate=${new Date(agora).toISOString()}&acao=login.falha`,
      headers,
    })
    expect(semAtor.json().itens).toEqual([expect.objectContaining({ id: d.id, atorTipo: 'SISTEMA', ator: null })])

    const pagina2 = await app.inject({ method: 'GET', url: '/api/v1/auditoria?porPagina=2&pagina=2', headers })
    expect(pagina2.json()).toMatchObject({ total: 4, pagina: 2, porPagina: 2 })
    expect(ids(pagina2.json().itens)).toEqual([b.id, c.id])
  })

  it('cadastro grava atorId, ip e requestId e a consulta devolve a linha', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const criada = await app.inject({
      method: 'POST',
      url: '/api/v1/areas',
      headers,
      payload: { nome: 'Auditada', atende: true, ativo: true, jornadaId: null },
    })
    expect(criada.statusCode).toBe(201)
    const areaId = criada.json().id

    const gravada = await prisma.auditoria.findFirst({
      where: { acao: 'cadastro.criado', entidade: 'area', entidadeId: String(areaId) },
    })
    expect(gravada).not.toBeNull()
    expect(gravada?.atorId).toBe(admin.id)
    expect(gravada?.ip).toBe('127.0.0.1')
    expect(gravada?.requestId).toMatch(UUID)

    const lista = await app.inject({
      method: 'GET',
      url: `/api/v1/auditoria?entidade=area&entidadeId=${areaId}`,
      headers,
    })
    expect(lista.statusCode).toBe(200)
    expect(lista.json().itens).toEqual([
      expect.objectContaining({
        acao: 'cadastro.criado',
        ator: { id: admin.id, nome: expect.any(String) },
        ip: '127.0.0.1',
        requestId: gravada?.requestId,
        dados: expect.objectContaining({ depois: expect.objectContaining({ nome: 'Auditada' }) }),
      }),
    ])
  })

  it('T50: UPDATE lança 42501 mesmo com 0 linhas afetadas', async () => {
    await linha({ atorTipo: 'SISTEMA', acao: 'teste.imutavel', entidade: 'teste' })
    await expect(prisma.$executeRaw`UPDATE auditoria SET acao = 'alterada'`).rejects.toThrow(/somente inserção/)
    await expect(prisma.$executeRaw`UPDATE auditoria SET acao = 'alterada' WHERE false`).rejects.toThrow(
      /somente inserção/,
    )
    expect(await prisma.auditoria.count({ where: { acao: 'teste.imutavel' } })).toBe(1)
  })

  it('T50: DELETE sem a GUC lança 42501 e, com a GUC, só purga registros com mais de 365 dias', async () => {
    await linha({ atorTipo: 'SISTEMA', acao: 'teste.recente', entidade: 'teste' })
    await expect(prisma.$executeRaw`DELETE FROM auditoria`).rejects.toThrow(/DELETE só pela purga/)

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('vinimon.purga_auditoria', 'on', true)`
        await tx.$executeRaw`DELETE FROM auditoria WHERE criado_em > now() - interval '1 day'`
      }),
    ).rejects.toThrow(/DELETE só pela purga/)

    await linha({
      atorTipo: 'SISTEMA',
      acao: 'teste.antigo',
      entidade: 'teste',
      criadoEm: new Date(Date.now() - 400 * DIA),
    })
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('vinimon.purga_auditoria', 'on', true)`
      await tx.$executeRaw`DELETE FROM auditoria WHERE criado_em < now() - interval '365 days'`
    })
    expect(await prisma.auditoria.findMany({ select: { acao: true } })).toEqual([{ acao: 'teste.recente' }])
  })
})
