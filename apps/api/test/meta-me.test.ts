import { CHAVES_CONFIG_PUBLICAS } from '@vinimon/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type App, buildApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { criarUsuario, headersDe, limparBanco, ORIGEM } from './ajudantes'
import { semearBase } from './fabricas'

describe('módulos meta e me (T-3.15)', () => {
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
    await semearBase()
  })

  it('GET /meta: 401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/meta' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('PATCH /me: 401 sem sessão', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { origin: ORIGEM },
      payload: { nome: 'Ana' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ erro: { codigo: 'NAO_AUTENTICADO' } })
  })

  it('USUARIO recebe meta sem tags, só com config pública e catálogos ativos', async () => {
    const usuario = await criarUsuario({ perfil: 'USUARIO' })
    await prisma.tag.create({ data: { nome: 'Rede', nomeNormalizado: 'rede' } })
    await prisma.area.create({ data: { nome: 'Área desativada', atende: true, ativo: false } })

    const res = await app.inject({ method: 'GET', url: '/api/v1/meta', headers: await headersDe(usuario.id) })
    expect(res.statusCode).toBe(200)
    const corpo = res.json()
    expect(corpo).not.toHaveProperty('tags')
    expect(corpo.areas.map((a: { nome: string }) => a.nome)).not.toContain('Área desativada')
    expect(Object.keys(corpo.config).sort()).toEqual([...CHAVES_CONFIG_PUBLICAS].sort())
    expect(corpo.config).not.toHaveProperty('sessao.horasAbsoluta')
    expect(corpo.prioridades[0]).toEqual(
      expect.objectContaining({ id: expect.any(Number), nome: expect.any(String), cor: expect.any(String) }),
    )
    expect(corpo.status[0]).toEqual(
      expect.objectContaining({ tipo: expect.any(String), papel: expect.anything(), ignorado: expect.any(Boolean) }),
    )
    expect(corpo).toHaveProperty('problemas')
    expect(corpo).toHaveProperty('canais')
    expect(corpo).toHaveProperty('departamentos')
    expect(corpo).toHaveProperty('unidades')
    expect(corpo).toHaveProperty('tiposAtivo')
    expect(corpo).toHaveProperty('jornadas')
    expect(corpo).toHaveProperty('categorias')
  })

  it('OPERADOR (chamado.atender) recebe tags', async () => {
    const operador = await criarUsuario({ perfil: 'OPERADOR' })
    await prisma.tag.create({ data: { nome: 'Rede', nomeNormalizado: 'rede' } })
    const res = await app.inject({ method: 'GET', url: '/api/v1/meta', headers: await headersDe(operador.id) })
    expect(res.statusCode).toBe(200)
    expect(res.json().tags).toEqual([expect.objectContaining({ nome: 'Rede' })])
  })

  it('PATCH /me: 400 para perfil e para body vazio, com detalhes por campo', async () => {
    const usuario = await criarUsuario({ perfil: 'USUARIO' })
    const headers = await headersDe(usuario.id)

    const escalada = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers,
      payload: { perfil: 'ADMIN' },
    })
    expect(escalada.statusCode).toBe(400)
    expect(escalada.json().erro.codigo).toBe('VALIDACAO')
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).perfil).toBe('USUARIO')

    const vazio = await app.inject({ method: 'PATCH', url: '/api/v1/me', headers, payload: {} })
    expect(vazio.statusCode).toBe(400)

    const emailInvalido = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers,
      payload: { email: 'nao-e-email' },
    })
    expect(emailInvalido.statusCode).toBe(400)
    expect(emailInvalido.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'email' })])
  })

  it('PATCH /me: caminho feliz, sem campos sensíveis na resposta, com auditoria', async () => {
    const usuario = await criarUsuario({ perfil: 'USUARIO' })
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: await headersDe(usuario.id),
      payload: {
        nome: '  Ana Souza ',
        email: 'ANA@Teste.Local',
        telefone: '',
        tema: 'ESCURO',
        densidade: 'COMPACTA',
        enviarComEnter: false,
      },
    })
    expect(res.statusCode).toBe(200)
    const corpo = res.json()
    expect(corpo).toMatchObject({
      id: usuario.id,
      nome: 'Ana Souza',
      email: 'ana@teste.local',
      telefone: null,
      tema: 'ESCURO',
      densidade: 'COMPACTA',
      enviarComEnter: false,
    })
    for (const proibido of ['senhaHash', 'totpSecretEnc', 'totpSecretPendenteEnc', 'buscaNorm', 'tokenHash']) {
      expect(corpo).not.toHaveProperty(proibido)
    }
    const auditoria = await prisma.auditoria.findMany({
      where: { acao: 'usuario.alterado', entidadeId: String(usuario.id) },
    })
    expect(auditoria).toHaveLength(1)
    expect(JSON.stringify(auditoria[0]?.dados)).not.toMatch(/senha|totp/i)
  })

  it('PATCH /me: 409 ao usar e-mail de outro usuário', async () => {
    const ana = await criarUsuario({ perfil: 'USUARIO' })
    const bia = await criarUsuario({ perfil: 'USUARIO' })
    await prisma.usuario.update({ where: { id: bia.id }, data: { email: 'bia@teste.local' } })

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: await headersDe(ana.id),
      payload: { email: 'bia@teste.local' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().erro.codigo).toBe('CONFLITO')
    expect(res.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'email' })])
  })
})
