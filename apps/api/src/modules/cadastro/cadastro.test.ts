import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import type { Prisma } from '../../generated/prisma/client'
import { invalidarConfig } from '../../lib/config'
import { prisma } from '../../lib/prisma'

const JSON_HDR = { 'content-type': 'application/json', origin: ORIGEM }
const DOMINIO = 'empresa.teste'
const NOVA_SENHA = 'Pitanga-Lanterna-Rio-2027'

describe('auto-cadastro com aprovação do administrador (A14)', () => {
  let app: App

  beforeEach(async () => {
    await limparBanco()
    // Um app novo por teste: o rate limit (3/h por IP) fica zerado a cada caso.
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
  })

  const configurar = async (chaves: Record<string, Prisma.InputJsonValue>) => {
    for (const [chave, valor] of Object.entries(chaves)) {
      await prisma.config.upsert({ where: { chave }, create: { chave, valor }, update: { valor } })
    }
    invalidarConfig()
  }
  const habilitar = () =>
    configurar({
      'cadastro.habilitado': true,
      'cadastro.dominiosPermitidos': [DOMINIO],
      'email.habilitado': true,
    })

  const corpo = (extra: Record<string, unknown> = {}) => ({
    login: 'ana.silva',
    nome: 'Ana Silva',
    email: `ana.silva@${DOMINIO}`,
    ...extra,
  })
  const solicitar = (payload: Record<string, unknown>, ip = '10.1.0.1') =>
    app.inject({ method: 'POST', url: '/api/v1/publico/cadastro', headers: JSON_HDR, remoteAddress: ip, payload })
  const ultimoEmail = async (): Promise<string> => {
    const email = await prisma.emailSaida.findFirstOrThrow({ orderBy: { id: 'desc' }, select: { texto: true } })
    return email.texto
  }
  const tokenDeConfirmacao = async (): Promise<string> => {
    const m = /confirmar-cadastro\?token=([\w-]+)/.exec(await ultimoEmail())
    if (!m?.[1]) throw new Error('link de confirmação ausente')
    return m[1]
  }
  const confirmar = (token: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/publico/cadastro/confirmar',
      headers: JSON_HDR,
      payload: { token },
    })
  const aprovar = (id: number, headers: Record<string, string>) =>
    app.inject({ method: 'POST', url: `/api/v1/cadastros/${id}/aprovar`, headers })

  it('401 sem sessão e 403 para quem não administra usuários', async () => {
    const semSessao = await app.inject({
      method: 'POST',
      url: '/api/v1/cadastros/1/aprovar',
      headers: { origin: ORIGEM },
    })
    expect(semSessao.statusCode).toBe(401)
    expect(semSessao.json().erro.codigo).toBe('NAO_AUTENTICADO')
    const operador = await criarUsuario({ perfil: 'OPERADOR' })
    const negado = await aprovar(1, await headersDe(operador.id))
    expect(negado.statusCode).toBe(403)
    expect(negado.json().erro.codigo).toBe('SEM_PERMISSAO')
    const lista = await app.inject({ method: 'GET', url: '/api/v1/cadastros', headers: await headersDe(operador.id) })
    expect(lista.statusCode).toBe(403)
  })

  it('400 com detalhes para corpo inválido e chave desconhecida', async () => {
    await habilitar()
    const curto = await solicitar(corpo({ login: 'x' }))
    expect(curto.statusCode).toBe(400)
    expect(curto.json().erro.codigo).toBe('VALIDACAO')
    expect(curto.json().erro.detalhes).toEqual(expect.arrayContaining([expect.objectContaining({ campo: 'login' })]))
    const extra = await solicitar(corpo({ perfil: 'ADMIN' }))
    expect(extra.statusCode).toBe(400)
    const semToken = await app.inject({
      method: 'POST',
      url: '/api/v1/publico/cadastro/confirmar',
      headers: JSON_HDR,
      payload: {},
    })
    expect(semToken.statusCode).toBe(400)
  })

  it('caminho feliz: pedido, confirmação, aprovação e link de definição de senha', async () => {
    await habilitar()
    const pedido = await solicitar(corpo())
    expect(pedido.statusCode).toBe(202)
    expect(pedido.json().mensagem).toMatch(/enviaremos/)

    const pendente = await prisma.cadastroPendente.findFirstOrThrow({
      select: { id: true, tokenHash: true, confirmadoEm: true },
    })
    expect(pendente.confirmadoEm).toBeNull()
    const token = await tokenDeConfirmacao()
    // só o hash vai ao banco
    expect(pendente.tokenHash).toBe(createHash('sha256').update(token).digest('hex'))

    expect((await confirmar(token)).statusCode).toBe(204)
    expect(
      (await prisma.cadastroPendente.findUniqueOrThrow({ where: { id: pendente.id } })).confirmadoEm,
    ).not.toBeNull()

    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const lista = await app.inject({ method: 'GET', url: '/api/v1/cadastros', headers })
    expect(lista.statusCode).toBe(200)
    expect(lista.json()).toMatchObject({ total: 1, itens: [{ login: 'ana.silva', email: `ana.silva@${DOMINIO}` }] })
    expect(lista.json().itens[0]).not.toHaveProperty('tokenHash')

    const aprovado = await aprovar(pendente.id, headers)
    expect(aprovado.statusCode).toBe(200)
    expect(aprovado.json()).toMatchObject({ login: 'ana.silva', perfil: 'USUARIO', ativo: true })
    const [hash] = await prisma.$queryRaw<{ senha_hash: string | null }[]>`
      SELECT senha_hash FROM usuarios WHERE login = 'ana.silva'`
    expect(hash?.senha_hash).toBeNull()
    expect(await prisma.cadastroPendente.count()).toBe(0)
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.aprovado', entidade: 'usuario' } })).toBe(1)

    // o e-mail de definição de senha vem pelo fluxo de redefinição (T-12.4)
    const m = /redefinir-senha\?token=([\w-]+)/.exec(await ultimoEmail())
    expect(m?.[1]).toBeDefined()
    const redefinida = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/redefinir-senha',
      headers: JSON_HDR,
      payload: { token: m?.[1] ?? '', novaSenha: NOVA_SENHA },
    })
    expect(redefinida.statusCode).toBe(204)
    const entrou = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: JSON_HDR,
      payload: { login: 'ana.silva', senha: NOVA_SENHA },
    })
    expect(entrou.statusCode).toBe(200)
  })

  it('domínio fora da lista é ignorado em silêncio: sem registro e sem e-mail', async () => {
    await habilitar()
    const res = await solicitar(corpo({ email: 'ana@outro.teste' }))
    expect(res.statusCode).toBe(202)
    expect(await prisma.cadastroPendente.count()).toBe(0)
    expect(await prisma.emailSaida.count()).toBe(0)
  })

  it('resposta genérica idêntica para qualquer entrada, inclusive com cadastro desligado ou login existente', async () => {
    const existente0 = await criarUsuario({ perfil: 'USUARIO' })
    await prisma.usuario.update({ where: { id: existente0.id }, data: { login: 'ana.silva' } })
    const desligado = await solicitar(corpo({ login: 'bruno.lima', email: `bruno@${DOMINIO}` }), '10.2.0.1')
    await habilitar()
    const foraDaLista = await solicitar(corpo({ email: 'ana@outro.teste' }), '10.2.0.2')
    const existente = await solicitar(corpo({ email: `outra@${DOMINIO}` }), '10.2.0.3')
    const novo = await solicitar(corpo({ login: 'carla.nunes', email: `carla@${DOMINIO}` }), '10.2.0.4')
    for (const r of [desligado, foraDaLista, existente, novo]) {
      expect(r.statusCode).toBe(202)
      expect(r.json()).toEqual(novo.json())
    }
    expect(await prisma.cadastroPendente.count()).toBe(1) // só o novo foi gravado
  })

  it('não revela login já existente: nenhum registro e nenhum e-mail', async () => {
    await habilitar()
    const u = await criarUsuario({ perfil: 'USUARIO' })
    const res = await solicitar({ login: u.login, nome: 'Outra Pessoa', email: `outra@${DOMINIO}` })
    expect(res.statusCode).toBe(202)
    expect(await prisma.cadastroPendente.count()).toBe(0)
    expect(await prisma.emailSaida.count()).toBe(0)
  })

  it('cadastro desligado: resposta genérica e nada gravado', async () => {
    await configurar({ 'cadastro.dominiosPermitidos': [DOMINIO] })
    const res = await solicitar(corpo())
    expect(res.statusCode).toBe(202)
    expect(await prisma.cadastroPendente.count()).toBe(0)
    expect(await prisma.emailSaida.count()).toBe(0)
  })

  it('token inválido na confirmação dá 400', async () => {
    await habilitar()
    await solicitar(corpo())
    const res = await confirmar('token-que-nao-existe')
    expect(res.statusCode).toBe(400)
    expect(res.json().erro.codigo).toBe('REQUISICAO_INVALIDA')
  })

  it('409 ao aprovar sem confirmação e 404 para cadastro inexistente', async () => {
    await habilitar()
    await solicitar(corpo())
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const pendente = await prisma.cadastroPendente.findFirstOrThrow({ select: { id: true } })
    const semConfirmacao = await aprovar(pendente.id, headers)
    expect(semConfirmacao.statusCode).toBe(409)
    expect(semConfirmacao.json().erro.codigo).toBe('CONFLITO')
    const inexistente = await aprovar(999_999, headers)
    expect(inexistente.statusCode).toBe(404)
    expect(inexistente.json().erro.codigo).toBe('NAO_ENCONTRADO')
  })

  it('409 ao aprovar quando o login foi criado depois do pedido', async () => {
    await habilitar()
    await solicitar(corpo())
    await confirmar(await tokenDeConfirmacao())
    const pendente = await prisma.cadastroPendente.findFirstOrThrow({ select: { id: true } })
    const outro = await criarUsuario({ perfil: 'USUARIO' })
    await prisma.usuario.update({ where: { id: outro.id }, data: { login: 'ana.silva' } })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await aprovar(pendente.id, await headersDe(admin.id))
    expect(res.statusCode).toBe(409)
    expect(res.json().erro.codigo).toBe('CONFLITO')
  })

  it('422 ao aprovar com o envio de e-mail desligado', async () => {
    await habilitar()
    await solicitar(corpo())
    await confirmar(await tokenDeConfirmacao())
    await configurar({ 'email.habilitado': false })
    const pendente = await prisma.cadastroPendente.findFirstOrThrow({ select: { id: true } })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const res = await aprovar(pendente.id, await headersDe(admin.id))
    expect(res.statusCode).toBe(422)
    expect(res.json().erro.codigo).toBe('REGRA_NEGOCIO')
  })

  it('429 no 4º pedido na hora pelo mesmo IP', async () => {
    await habilitar()
    for (let i = 0; i < 3; i++) {
      expect(
        (await solicitar(corpo({ login: `pessoa${i}.x`, email: `pessoa${i}@${DOMINIO}` }), '10.9.0.1')).statusCode,
      ).toBe(202)
    }
    expect((await solicitar(corpo({ login: 'pessoa9.x', email: `pessoa9@${DOMINIO}` }), '10.9.0.1')).statusCode).toBe(
      429,
    )
  })
})
