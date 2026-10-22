import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  criarArea,
  criarUsuario,
  headersDe,
  limparBanco,
  ORIGEM,
  SENHA_TESTE,
  tokenDoCookie,
} from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'
import { NOME_COOKIE } from '../../lib/sessao'

describe('módulo usuarios', () => {
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

  const corpo = (extra: Record<string, unknown> = {}) => ({
    login: 'maria.silva',
    nome: 'Maria Silva',
    perfil: 'USUARIO',
    areaSecundariaIds: [],
    ativo: true,
    ...extra,
  })

  async function criar(headers: Record<string, string>, extra: Record<string, unknown> = {}) {
    return app.inject({ method: 'POST', url: '/api/v1/usuarios', headers, payload: corpo(extra) })
  }

  it('401 sem sessão', async () => {
    for (const [method, url] of [
      ['GET', '/api/v1/usuarios'],
      ['GET', '/api/v1/usuarios/1'],
      ['GET', '/api/v1/usuarios/busca?q=ma'],
      ['POST', '/api/v1/usuarios'],
      ['PATCH', '/api/v1/usuarios/1'],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        headers: { origin: ORIGEM },
        payload: method === 'GET' ? undefined : {},
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().erro.codigo).toBe('NAO_AUTENTICADO')
    }
  })

  it('403 para USUARIO e OPERADOR no CRUD', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const headers = await headersDe(u.id)
      for (const [method, url] of [
        ['GET', '/api/v1/usuarios'],
        ['GET', `/api/v1/usuarios/${u.id}`],
        ['POST', '/api/v1/usuarios'],
        ['PATCH', `/api/v1/usuarios/${u.id}`],
      ] as const) {
        const res = await app.inject({ method, url, headers, payload: method === 'GET' ? undefined : {} })
        expect(res.statusCode).toBe(403)
        expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
      }
    }
  })

  it('400 com detalhes para corpo inválido', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const res = await criar(headers, {
      login: 'a b',
      email: 'nao-e-email',
      areaSecundariaIds: Array(21).fill(1),
      extra: 1,
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().erro.codigo).toBe('VALIDACAO')
    expect(res.json().erro.detalhes.length).toBeGreaterThan(0)
    const vazio = await app.inject({ method: 'PATCH', url: `/api/v1/usuarios/${admin.id}`, headers, payload: {} })
    expect(vazio.statusCode).toBe(400)
    const curta = await app.inject({ method: 'GET', url: '/api/v1/usuarios/busca?q=a', headers })
    expect(curta.statusCode).toBe(400)
  })

  it('ADMIN cria usuário: senha temporária única, sem segredos, deveTrocarSenha e auditoria sem senha', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const area = await criarArea()
    const res = await criar(headers, {
      login: '  Maria.Silva ',
      email: 'Maria@Teste.Local',
      areaId: area.id,
      areaSecundariaIds: [area.id],
    })
    expect(res.statusCode).toBe(201)
    const { usuario, senhaTemporaria } = res.json()
    expect(senhaTemporaria).toHaveLength(16)
    expect(usuario).toMatchObject({
      login: 'maria.silva',
      email: 'maria@teste.local',
      perfil: 'USUARIO',
      areaId: area.id,
      areaSecundariaIds: [area.id],
      deveTrocarSenha: true,
      ativo: true,
    })
    expect(JSON.stringify(usuario)).not.toMatch(/senhaHash|argon2|totp|buscaNorm/i)
    const gravado = await prisma.usuario.findUnique({ where: { id: usuario.id }, select: { senhaHash: true } })
    expect(gravado?.senhaHash).toMatch(/^\$argon2id\$/)
    const auditoria = await prisma.auditoria.findMany({ where: { acao: 'usuario.criado' } })
    expect(auditoria).toHaveLength(1)
    expect(JSON.stringify(auditoria)).not.toContain(senhaTemporaria)
    expect(JSON.stringify(auditoria)).not.toMatch(/argon2/)

    // a senha temporária funciona no login
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGEM },
      payload: { login: 'maria.silva', senha: senhaTemporaria },
    })
    expect(login.statusCode).toBe(200)
    expect(login.json().estado).toBe('TROCA_SENHA')

    const outra = await criar(headers, { login: 'outro.usuario' })
    expect(outra.json().senhaTemporaria).not.toBe(senhaTemporaria)

    const obtido = await app.inject({ method: 'GET', url: `/api/v1/usuarios/${usuario.id}`, headers })
    expect(obtido.statusCode).toBe(200)
    expect(obtido.json().login).toBe('maria.silva')
    const inexistente = await app.inject({ method: 'GET', url: '/api/v1/usuarios/999999', headers })
    expect(inexistente.statusCode).toBe(404)
  })

  it('T12: "Admin" com "admin" existente dá 409; e-mail repetido também', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    await prisma.usuario.update({ where: { id: admin.id }, data: { login: 'admin' } })
    const headers = await headersDe(admin.id)
    const dup = await criar(headers, { login: 'Admin' })
    expect(dup.statusCode).toBe(409)
    expect(dup.json().erro.codigo).toBe('CONFLITO')
    expect(await criar(headers, { login: 'a.b.c', email: 'x@teste.local' })).toMatchObject({ statusCode: 201 })
    const email = await criar(headers, { login: 'd.e.f', email: 'X@Teste.local' })
    expect(email.statusCode).toBe(409)
  })

  it('OPERADOR exige área que atende (422); ADMIN aceita área nula', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const semArea = await criar(headers, { perfil: 'OPERADOR' })
    expect(semArea.statusCode).toBe(422)
    const naoAtende = await criarArea({ atende: false })
    const res = await criar(headers, { perfil: 'OPERADOR', areaId: naoAtende.id })
    expect(res.statusCode).toBe(422)
    const atende = await criarArea()
    expect((await criar(headers, { perfil: 'OPERADOR', areaId: atende.id })).statusCode).toBe(201)
    expect((await criar(headers, { login: 'outro.admin', perfil: 'ADMIN' })).statusCode).toBe(201)
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/usuarios/${(await criarUsuario({ perfil: 'USUARIO' })).id}`,
      headers,
      payload: { perfil: 'OPERADOR' },
    })
    expect(patch.statusCode).toBe(422)
  })

  it('lista paginada com filtros e busca sem acento', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    await criar(headers, { login: 'jose.a', nome: 'José Araújo' })
    await criar(headers, { login: 'ana.b', nome: 'Ana Braga', ativo: false })
    const lista = await app.inject({ method: 'GET', url: '/api/v1/usuarios?busca=jose&porPagina=5', headers })
    expect(lista.json()).toMatchObject({ total: 1, itens: [{ nome: 'José Araújo' }] })
    const inativos = await app.inject({ method: 'GET', url: '/api/v1/usuarios?ativo=false', headers })
    expect(inativos.json().total).toBe(1)
    const todos = await app.inject({ method: 'GET', url: '/api/v1/usuarios?porPagina=1&pagina=2', headers })
    expect(todos.json()).toMatchObject({ total: 3, pagina: 2, porPagina: 1 })
  })

  it('PATCH altera dados, audita antes/depois e responde 404 para inexistente', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const alvo = await criarUsuario({ perfil: 'USUARIO' })
    const headers = await headersDe(admin.id)
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/usuarios/${alvo.id}`,
      headers,
      payload: { nome: 'Nome Novo', telefone: '(11) 99999-0000' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ nome: 'Nome Novo', telefone: '(11) 99999-0000' })
    const [audit] = await prisma.auditoria.findMany({ where: { acao: 'usuario.alterado' } })
    expect(audit?.dados).toMatchObject({ antes: { id: alvo.id }, depois: { nome: 'Nome Novo' } })
    expect(JSON.stringify(audit?.dados)).not.toMatch(/senhaHash|totp|argon2/i)
    const nada = await app.inject({ method: 'PATCH', url: '/api/v1/usuarios/999999', headers, payload: { nome: 'Xx' } })
    expect(nada.statusCode).toBe(404)
  })

  it('mudança de perfil derruba as sessões do alvo (login real)', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const alvo = await criarUsuario({ perfil: 'USUARIO' })
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGEM },
      payload: { login: alvo.login, senha: SENHA_TESTE },
    })
    expect(login.statusCode).toBe(200)
    const cookie = `${NOME_COOKIE}=${tokenDoCookie(login)}`
    const antes = await app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers: { cookie } })
    expect(antes.statusCode).toBe(200)

    const area = await criarArea()
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/usuarios/${alvo.id}`,
      headers: await headersDe(admin.id),
      payload: { perfil: 'OPERADOR', areaId: area.id },
    })
    expect(res.statusCode).toBe(200)
    const depois = await app.inject({ method: 'GET', url: '/api/v1/auth/sessao', headers: { cookie } })
    expect(depois.statusCode).toBe(401)
    const revogada = await prisma.sessao.findFirst({ where: { usuarioId: alvo.id } })
    expect(revogada?.motivoRevogacao).toBe('perfil_alterado')
  })

  it('desativar revoga sessões com motivo usuario_desativado; mudar só o nome não revoga', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const alvo = await criarUsuario({ perfil: 'USUARIO' })
    await headersDe(alvo.id)
    const headers = await headersDe(admin.id)
    await app.inject({ method: 'PATCH', url: `/api/v1/usuarios/${alvo.id}`, headers, payload: { nome: 'Outro Nome' } })
    expect(await prisma.sessao.count({ where: { usuarioId: alvo.id, revogadaEm: null } })).toBe(1)
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/usuarios/${alvo.id}`,
      headers,
      payload: { ativo: false },
    })
    expect(res.statusCode).toBe(200)
    const s = await prisma.sessao.findFirst({ where: { usuarioId: alvo.id } })
    expect(s?.motivoRevogacao).toBe('usuario_desativado')
  })

  it('T39: ninguém muda o próprio perfil/ativo', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const url = `/api/v1/usuarios/${admin.id}`
    const area = await criarArea()
    const desativar = await app.inject({ method: 'PATCH', url, headers, payload: { ativo: false } })
    expect(desativar.statusCode).toBe(409)
    expect(desativar.json().erro.codigo).toBe('CONFLITO')
    const rebaixar = await app.inject({
      method: 'PATCH',
      url,
      headers,
      payload: { perfil: 'OPERADOR', areaId: area.id },
    })
    expect(rebaixar.statusCode).toBe(409)
    expect((await app.inject({ method: 'PATCH', url, headers, payload: { nome: 'Novo Nome' } })).statusCode).toBe(200)
    expect((await prisma.usuario.findUnique({ where: { id: admin.id } }))?.perfil).toBe('ADMIN')
  })

  it('T39: dois ADMIN se rebaixando ao mesmo tempo nunca zeram os administradores ativos', async () => {
    const a = await criarUsuario({ perfil: 'ADMIN' })
    const b = await criarUsuario({ perfil: 'ADMIN' })
    const area = await criarArea()
    const [ha, hb] = [await headersDe(a.id), await headersDe(b.id)]
    const respostas = await Promise.all([
      app.inject({
        method: 'PATCH',
        url: `/api/v1/usuarios/${b.id}`,
        headers: ha,
        payload: { perfil: 'OPERADOR', areaId: area.id },
      }),
      app.inject({
        method: 'PATCH',
        url: `/api/v1/usuarios/${a.id}`,
        headers: hb,
        payload: { perfil: 'OPERADOR', areaId: area.id },
      }),
    ])
    const codigos = respostas.map((r) => r.statusCode)
    expect(codigos).toContain(200)
    expect(codigos.filter((c) => c === 200)).toHaveLength(1)
    expect(await prisma.usuario.count({ where: { perfil: 'ADMIN', ativo: true } })).toBe(1)
  })

  it('admin inativo não conta como ADMIN ativo e pode ser rebaixado', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const inativo = await criarUsuario({ perfil: 'ADMIN', ativo: false })
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/usuarios/${inativo.id}`,
      headers: await headersDe(admin.id),
      payload: { perfil: 'USUARIO' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('busca: ≤ 20, só ativos, sem acento; OPERADOR não vê login, ADMIN vê', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const operador = await criarUsuario({ perfil: 'OPERADOR' })
    const adminHeaders = await headersDe(admin.id)
    for (let i = 0; i < 22; i++) {
      await criar(adminHeaders, { login: `zelia${i}`, nome: `Zélia ${i}` })
    }
    await criar(adminHeaders, { login: 'zelia.inativa', nome: 'Zélia Inativa', ativo: false })
    await criar(adminHeaders, { login: 'lit.eral', nome: '100%_literal' })

    const opRes = await app.inject({
      method: 'GET',
      url: `/api/v1/usuarios/busca?q=${encodeURIComponent('zelia')}`,
      headers: await headersDe(operador.id),
    })
    expect(opRes.statusCode).toBe(200)
    expect(opRes.json()).toHaveLength(20)
    for (const item of opRes.json()) {
      expect(item).not.toHaveProperty('login')
      expect(item).toHaveProperty('areaNome')
      expect(item.nome).not.toContain('Inativa')
    }
    const admRes = await app.inject({ method: 'GET', url: '/api/v1/usuarios/busca?q=Zélia', headers: adminHeaders })
    expect(admRes.json()[0]).toHaveProperty('login')
    const curinga = await app.inject({ method: 'GET', url: '/api/v1/usuarios/busca?q=%25_', headers: adminHeaders })
    expect(curinga.json()).toHaveLength(1)
    const outro = await app.inject({ method: 'GET', url: '/api/v1/usuarios/busca?q=%25%25', headers: adminHeaders })
    expect(outro.json()).toHaveLength(0)
  })

  it('403 na busca para USUARIO (sem usuario.buscar)', async () => {
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const res = await app.inject({ method: 'GET', url: '/api/v1/usuarios/busca?q=ab', headers: await headersDe(u.id) })
    expect(res.statusCode).toBe(403)
  })
})
