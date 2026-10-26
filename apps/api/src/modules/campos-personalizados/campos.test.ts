import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('módulo campos personalizados', () => {
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

  const corpo = {
    chave: 'codigo_bem',
    rotulo: 'Código do bem',
    tipo: 'TEXTO',
    opcoes: [],
    obrigatorio: false,
    regex: null,
    ajuda: null,
    visibilidade: 'ABERTURA',
    ordem: 0,
    ativo: true,
    problemas: [],
  }
  const U = '/api/v1/campos-personalizados'

  it('401 sem sessão', async () => {
    const res = await app.inject({ method: 'GET', url: U })
    expect(res.statusCode).toBe(401)
  })

  it('403 para USUARIO e OPERADOR no CRUD', async () => {
    for (const perfil of ['USUARIO', 'OPERADOR'] as const) {
      const u = await criarUsuario({ perfil })
      const res = await app.inject({ method: 'GET', url: U, headers: await headersDe(u.id) })
      expect(res.statusCode).toBe(403)
    }
  })

  it('400 com detalhes: seleção sem opções, regex inválida, chave inválida e campo extra', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const semOpcoes = await app.inject({ method: 'POST', url: U, headers, payload: { ...corpo, tipo: 'SELECAO' } })
    expect(semOpcoes.statusCode).toBe(400)
    expect(semOpcoes.json().erro.detalhes).toEqual([expect.objectContaining({ campo: 'opcoes' })])
    const regex = await app.inject({ method: 'POST', url: U, headers, payload: { ...corpo, regex: '(' } })
    expect(regex.statusCode).toBe(400)
    const chave = await app.inject({ method: 'POST', url: U, headers, payload: { ...corpo, chave: 'Ruim' } })
    expect(chave.statusCode).toBe(400)
    const extra = await app.inject({ method: 'POST', url: U, headers, payload: { ...corpo, x: 1 } })
    expect(extra.statusCode).toBe(400)
  })

  it('ADMIN cria, lista, atualiza, audita, recebe 409 e 404', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const criado = await app.inject({ method: 'POST', url: U, headers, payload: corpo })
    expect(criado.statusCode).toBe(201)
    const id = criado.json().id as number
    expect(await prisma.auditoria.count({ where: { acao: 'cadastro.criado', entidade: 'campo_personalizado' } })).toBe(
      1,
    )

    const dup = await app.inject({ method: 'POST', url: U, headers, payload: corpo })
    expect(dup.statusCode).toBe(409)

    const lista = await app.inject({ method: 'GET', url: U, headers })
    expect(lista.json()).toMatchObject({ total: 1, itens: [{ chave: 'codigo_bem' }] })

    const atual = await app.inject({ method: 'PATCH', url: `${U}/${id}`, headers, payload: { rotulo: 'Novo' } })
    expect(atual.statusCode).toBe(200)
    expect(atual.json().rotulo).toBe('Novo')
    // mudar para seleção sem informar opções viola a regra sobre o resultado final
    const inval = await app.inject({ method: 'PATCH', url: `${U}/${id}`, headers, payload: { tipo: 'SELECAO' } })
    expect(inval.statusCode).toBe(400)
    const chaveImutavel = await app.inject({ method: 'PATCH', url: `${U}/${id}`, headers, payload: { chave: 'outra' } })
    expect(chaveImutavel.statusCode).toBe(400)

    expect((await app.inject({ method: 'GET', url: `${U}/9999`, headers })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: `${U}/${id}`, headers })).statusCode).toBe(204)
  })

  it('exclusão de campo com valores gravados é 409', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const headers = await headersDe(admin.id)
    const id = (await app.inject({ method: 'POST', url: U, headers, payload: corpo })).json().id as number
    const area = await prisma.area.create({ data: { nome: 'A' }, select: { id: true } })
    const status = await prisma.status.create({
      data: { nome: 'Aberto', tipo: 'ABERTO' },
      select: { id: true, tipo: true },
    })
    const prioridade = await prisma.prioridade.create({ data: { nome: 'Normal' }, select: { id: true } })
    const canal = await prisma.canal.create({ data: { nome: 'Sistema Web', sistema: true }, select: { id: true } })
    const jornada = await prisma.jornada.create({ data: { nome: 'Comercial' }, select: { id: true } })
    const chamado = await prisma.chamado.create({
      data: {
        assunto: 'Impressora parada',
        descricao: 'Não imprime',
        solicitanteId: admin.id,
        abertoPorId: admin.id,
        areaId: area.id,
        jornadaId: jornada.id,
        prioridadeId: prioridade.id,
        canalId: canal.id,
        statusId: status.id,
        statusTipo: status.tipo,
      },
      select: { id: true },
    })
    await prisma.chamadoCampoValor.create({ data: { chamadoId: chamado.id, campoId: id, valorTexto: 'z' } })
    const res = await app.inject({ method: 'DELETE', url: `${U}/${id}`, headers })
    expect(res.statusCode).toBe(409)
    expect(res.json().erro.codigo).toBe('REGISTRO_EM_USO')
  })

  it('aplicaveis: vínculo por problema, obrigatório do vínculo e visibilidade para USUARIO', async () => {
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const usuario = await criarUsuario({ perfil: 'USUARIO' })
    const hAdmin = await headersDe(admin.id)
    const area = await prisma.area.create({ data: { nome: 'B' }, select: { id: true } })
    const p1 = await prisma.problema.create({ data: { nome: 'P1', areaPadraoId: area.id }, select: { id: true } })
    const p2 = await prisma.problema.create({ data: { nome: 'P2', areaPadraoId: area.id }, select: { id: true } })
    await app.inject({ method: 'POST', url: U, headers: hAdmin, payload: { ...corpo, chave: 'global' } })
    await app.inject({
      method: 'POST',
      url: U,
      headers: hAdmin,
      payload: { ...corpo, chave: 'so_p1', problemas: [{ problemaId: p1.id, obrigatorio: true }] },
    })
    await app.inject({
      method: 'POST',
      url: U,
      headers: hAdmin,
      payload: { ...corpo, chave: 'oculto', visibilidade: 'OCULTO_SOLICITANTE' },
    })
    await app.inject({ method: 'POST', url: U, headers: hAdmin, payload: { ...corpo, chave: 'inativo', ativo: false } })

    const chaves = async (headers: Record<string, string>, query: string) =>
      ((await app.inject({ method: 'GET', url: `${U}/aplicaveis${query}`, headers })).json() as { chave: string }[])
        .map((c) => c.chave)
        .sort()

    expect(await chaves(hAdmin, '')).toEqual(['global', 'oculto'])
    expect(await chaves(hAdmin, `?problemaId=${p1.id}`)).toEqual(['global', 'oculto', 'so_p1'])
    expect(await chaves(hAdmin, `?problemaId=${p2.id}`)).toEqual(['global', 'oculto'])
    expect(await chaves(await headersDe(usuario.id), `?problemaId=${p1.id}`)).toEqual(['global', 'so_p1'])

    const res = await app.inject({ method: 'GET', url: `${U}/aplicaveis?problemaId=${p1.id}`, headers: hAdmin })
    expect(res.json().find((c: { chave: string }) => c.chave === 'so_p1').obrigatorio).toBe(true)
    const sem = await app.inject({ method: 'GET', url: `${U}/aplicaveis` })
    expect(sem.statusCode).toBe(401)
  })
})
