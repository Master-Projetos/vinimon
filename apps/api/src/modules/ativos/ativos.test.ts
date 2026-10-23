import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarAtivo, criarChamado, criarTipoAtivo } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo ativos', () => {
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

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/ativos' })
    expect(res.statusCode).toBe(401)
  })

  it('USUARIO recebe 403 em GET /ativos e na criação', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const headers = await headersDe(u.id)
    const lista = await app.inject({ method: 'GET', url: '/api/v1/ativos', headers })
    expect(lista.statusCode).toBe(403)
    expect(lista.json().erro.codigo).toBe('SEM_PERMISSAO')
    const cria = await app.inject({
      method: 'POST',
      url: '/api/v1/ativos',
      headers,
      payload: { etiqueta: 'A1', tipoId: 1 },
    })
    expect(cria.statusCode).toBe(403)
  })

  it('busca: 400 com 2 caracteres; qualquer autenticado busca por etiqueta (até 10)', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const headers = await headersDe(u.id)
    const curta = await app.inject({ method: 'GET', url: '/api/v1/ativos/busca?q=ab', headers })
    expect(curta.statusCode).toBe(400)
    expect(curta.json().erro.detalhes).toBeDefined()

    const tipo = await criarTipoAtivo()
    for (let i = 0; i < 12; i++) {
      await prisma.ativo.create({ data: { etiqueta: `NOTE-${String(i).padStart(2, '0')}`, tipoId: tipo.id } })
    }
    const res = await app.inject({ method: 'GET', url: '/api/v1/ativos/busca?q=note', headers })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(10)
    expect(res.json()[0]).toEqual({ id: expect.any(Number), etiqueta: 'NOTE-00', tipo: tipo.nome })
  })

  it('OPERADOR cria, lista com filtros e qtdChamados, atualiza; etiqueta inválida dá 400 e duplicada 409', async () => {
    const area = await criarArea()
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
    const headers = await headersDe(op.id)
    const tipo = await criarTipoAtivo()

    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/ativos',
      headers,
      payload: { etiqueta: 'PAT-001', tipoId: tipo.id, modelo: 'Dell 5420' },
    })
    expect(criado.statusCode).toBe(201)
    expect(criado.json()).toMatchObject({
      etiqueta: 'PAT-001',
      situacao: 'EM_USO',
      qtdChamados: 0,
      modelo: 'Dell 5420',
    })
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'ativo' } })).toBe(1)

    const invalida = await app.inject({
      method: 'POST',
      url: '/api/v1/ativos',
      headers,
      payload: { etiqueta: 'com espaço', tipoId: tipo.id },
    })
    expect(invalida.statusCode).toBe(400)
    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/ativos',
      headers,
      payload: { etiqueta: 'PAT-001', tipoId: tipo.id },
    })
    expect(dup.statusCode).toBe(409)

    const id = criado.json().id
    const upd = await app.inject({
      method: 'PATCH',
      url: `/api/v1/ativos/${id}`,
      headers,
      payload: { situacao: 'EM_MANUTENCAO' },
    })
    expect(upd.statusCode).toBe(200)
    expect(upd.json().situacao).toBe('EM_MANUTENCAO')

    const lista = await app.inject({ method: 'GET', url: '/api/v1/ativos?situacao=EM_MANUTENCAO&busca=dell', headers })
    expect(lista.json()).toMatchObject({ total: 1, itens: [{ etiqueta: 'PAT-001' }] })
    const vazia = await app.inject({ method: 'GET', url: '/api/v1/ativos?situacao=BAIXADO', headers })
    expect(vazia.json().total).toBe(0)
    const um = await app.inject({ method: 'GET', url: `/api/v1/ativos/${id}`, headers })
    expect(um.statusCode).toBe(200)
    const nada = await app.inject({ method: 'GET', url: '/api/v1/ativos/999999', headers })
    expect(nada.statusCode).toBe(404)
  })

  it('chamados do ativo respeitam o escopo do usuário', async () => {
    const areaA = await criarArea()
    const areaB = await criarArea()
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: areaA.id })
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const ativo = await criarAtivo()
    const dentro = await criarChamado({ solicitanteId: sol.id, areaId: areaA.id })
    const fora = await criarChamado({ solicitanteId: sol.id, areaId: areaB.id })
    await prisma.chamado.updateMany({ where: { id: { in: [dentro.id, fora.id] } }, data: { ativoId: ativo.id } })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/ativos/${ativo.id}/chamados`,
      headers: await headersDe(op.id),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().itens.map((c: { id: number }) => c.id)).toEqual([dentro.id])
    const nada = await app.inject({
      method: 'GET',
      url: '/api/v1/ativos/999999/chamados',
      headers: await headersDe(op.id),
    })
    expect(nada.statusCode).toBe(404)
  })

  it('DELETE: só ADMIN; ativo com chamados dá 409 "Use a situação Baixado"; sem chamados exclui', async () => {
    const area = await criarArea()
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const comChamado = await criarAtivo()
    const livre = await criarAtivo()
    const ch = await criarChamado({ solicitanteId: sol.id, areaId: area.id })
    await prisma.chamado.update({ where: { id: ch.id }, data: { ativoId: comChamado.id } })

    const proibido = await app.inject({
      method: 'DELETE',
      url: `/api/v1/ativos/${livre.id}`,
      headers: await headersDe(op.id),
    })
    expect(proibido.statusCode).toBe(403)

    const headers = await headersDe(admin.id)
    const em_uso = await app.inject({ method: 'DELETE', url: `/api/v1/ativos/${comChamado.id}`, headers })
    expect(em_uso.statusCode).toBe(409)
    expect(em_uso.json().erro.mensagem).toBe('Use a situação Baixado.')

    const ok = await app.inject({ method: 'DELETE', url: `/api/v1/ativos/${livre.id}`, headers })
    expect(ok.statusCode).toBe(204)
    expect(await prisma.ativo.count({ where: { id: livre.id } })).toBe(0)
  })
})
