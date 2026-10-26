import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

describe('gerente de área (A04)', () => {
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

  async function cenario() {
    const setor = await criarArea({ nome: 'Financeiro', atende: false })
    const outroSetor = await criarArea({ nome: 'Jurídico', atende: false })
    const atendimento = await criarArea({ nome: 'TI' })
    const gerente = await criarUsuario({ perfil: 'USUARIO', areaId: setor.id })
    const colega = await criarUsuario({ perfil: 'USUARIO', areaId: setor.id })
    const deOutroSetor = await criarUsuario({ perfil: 'USUARIO', areaId: outroSetor.id })
    const operador = await criarUsuario({ perfil: 'OPERADOR', areaId: atendimento.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    await prisma.areaGerente.create({ data: { areaId: setor.id, usuarioId: gerente.id } })
    return {
      setor,
      outroSetor,
      atendimento,
      gerente,
      colega,
      deOutroSetor,
      operador,
      admin,
      hGerente: await headersDe(gerente.id),
    }
  }

  const url = (areaId: number, sufixo = '') => `/api/v1/areas-geridas/${areaId}/usuarios${sufixo}`

  it('401 sem sessão e 404 para quem não gerencia a área', async () => {
    const x = await cenario()
    expect((await app.inject({ method: 'GET', url: url(x.setor.id) })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: url(x.outroSetor.id), headers: x.hGerente })).statusCode).toBe(404)
    const semGestao = await app.inject({ method: 'GET', url: url(x.setor.id), headers: await headersDe(x.colega.id) })
    expect(semGestao.statusCode).toBe(404)
    // nem o ADMIN edita por aqui: é para quem gerencia
    expect(
      (await app.inject({ method: 'GET', url: url(x.setor.id), headers: await headersDe(x.admin.id) })).statusCode,
    ).toBe(404)
  })

  it('lista só os USUARIO da área gerida, sem login nem e-mail', async () => {
    const x = await cenario()
    await criarUsuario({ perfil: 'OPERADOR', areaId: x.setor.id })
    const res = await app.inject({ method: 'GET', url: url(x.setor.id), headers: x.hGerente })
    expect(res.statusCode).toBe(200)
    const itens = res.json() as Array<Record<string, unknown>>
    expect(itens.map((i) => i.id).sort()).toEqual([x.gerente.id, x.colega.id].sort())
    expect(Object.keys(itens[0] ?? {}).sort()).toEqual(['ativo', 'departamentoId', 'id', 'nome', 'telefone'])
  })

  it('PATCH altera telefone, departamento e situação, com auditoria; desativar derruba a sessão', async () => {
    const x = await cenario()
    const unidade = await prisma.unidade.create({ data: { nome: 'Matriz' }, select: { id: true } })
    const dep = await prisma.departamento.create({
      data: { nome: 'Contas', unidadeId: unidade.id },
      select: { id: true },
    })
    const hColega = await headersDe(x.colega.id)
    const ok = await app.inject({
      method: 'PATCH',
      url: url(x.setor.id, `/${x.colega.id}`),
      headers: x.hGerente,
      payload: { telefone: '(11) 99999-0000', departamentoId: dep.id },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({
      id: x.colega.id,
      telefone: '(11) 99999-0000',
      departamentoId: dep.id,
      ativo: true,
    })
    expect(await prisma.auditoria.count({ where: { acao: 'usuario.alterado', entidadeId: String(x.colega.id) } })).toBe(
      1,
    )

    const off = await app.inject({
      method: 'PATCH',
      url: url(x.setor.id, `/${x.colega.id}`),
      headers: x.hGerente,
      payload: { ativo: false },
    })
    expect(off.statusCode).toBe(200)
    expect(off.json().ativo).toBe(false)
    const depois = await app.inject({ method: 'GET', url: '/api/v1/chamados', headers: hColega })
    expect(depois.statusCode).toBe(401)
  })

  it('PATCH: 400 com corpo inválido, 404 para quem é de outra área, equipe ou ADMIN, 422 ao se desativar', async () => {
    const x = await cenario()
    const patch = (id: number, payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: url(x.setor.id, `/${id}`), headers: x.hGerente, payload })
    const ruim = await patch(x.colega.id, { perfil: 'ADMIN' })
    expect(ruim.statusCode).toBe(400)
    expect(ruim.json().erro.detalhes.length).toBeGreaterThan(0)
    expect((await patch(x.colega.id, {})).statusCode).toBe(400)
    expect((await patch(x.deOutroSetor.id, { ativo: false })).statusCode).toBe(404)
    expect((await patch(x.admin.id, { ativo: false })).statusCode).toBe(404)
    expect((await patch(x.operador.id, { ativo: false })).statusCode).toBe(404)
    const eu = await patch(x.gerente.id, { ativo: false })
    expect(eu.statusCode).toBe(422)
    expect((await patch(x.gerente.id, { telefone: null })).statusCode).toBe(200)
    expect(await prisma.usuario.count({ where: { id: x.admin.id, ativo: true } })).toBe(1)
  })

  it('o gerente vê os chamados dos usuários da área (lista, visão e detalhe) mas não o conteúdo interno', async () => {
    const x = await cenario()
    const doSetor = await criarChamado({ solicitanteId: x.colega.id, areaId: x.atendimento.id, papel: 'INICIAL' })
    const alheio = await criarChamado({ solicitanteId: x.deOutroSetor.id, areaId: x.atendimento.id, papel: 'INICIAL' })
    await prisma.assentamento.create({
      data: {
        chamadoId: doSetor.id,
        autorId: x.operador.id,
        tipo: 'COMENTARIO',
        interno: true,
        texto: 'Nota da equipe',
      },
    })
    await prisma.assentamento.create({
      data: {
        chamadoId: doSetor.id,
        autorId: x.operador.id,
        tipo: 'COMENTARIO',
        interno: false,
        texto: 'Resposta pública',
      },
    })

    const lista = await app.inject({ method: 'GET', url: '/api/v1/chamados', headers: x.hGerente })
    const ids = (lista.json().itens as Array<{ id: number }>).map((i) => i.id)
    expect(ids).toContain(doSetor.id)
    expect(ids).not.toContain(alheio.id)

    const visao = await app.inject({ method: 'GET', url: '/api/v1/chamados?visao=areas-geridas', headers: x.hGerente })
    expect((visao.json().itens as Array<{ id: number }>).map((i) => i.id)).toEqual([doSetor.id])
    const contagens = await app.inject({ method: 'GET', url: '/api/v1/chamados/contagens', headers: x.hGerente })
    expect(contagens.json()['areas-geridas']).toBe(1)
    const semGestao = await app.inject({
      method: 'GET',
      url: '/api/v1/chamados/contagens',
      headers: await headersDe(x.colega.id),
    })
    expect(semGestao.json()['areas-geridas']).toBeUndefined()

    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/chamados/${doSetor.id}`, headers: x.hGerente })).statusCode,
    ).toBe(200)
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/chamados/${alheio.id}`, headers: x.hGerente })).statusCode,
    ).toBe(404)
    const comentarios = await app.inject({
      method: 'GET',
      url: `/api/v1/chamados/${doSetor.id}/assentamentos`,
      headers: x.hGerente,
    })
    expect(comentarios.statusCode).toBe(200)
    const textos = (comentarios.json().itens as Array<{ texto: string }>).map((a) => a.texto)
    expect(textos).toContain('Resposta pública')
    expect(textos).not.toContain('Nota da equipe')
    // perder a gestão tira o acesso
    await prisma.areaGerente.deleteMany({ where: { usuarioId: x.gerente.id } })
    expect(
      (await app.inject({ method: 'GET', url: `/api/v1/chamados/${doSetor.id}`, headers: x.hGerente })).statusCode,
    ).toBe(404)
  })

  describe('PATCH /usuarios/:id com areasGeridasIds', () => {
    const patchUsuario = (app2: App, id: number, headers: Record<string, string>, payload: Record<string, unknown>) =>
      app2.inject({ method: 'PATCH', url: `/api/v1/usuarios/${id}`, headers, payload })

    it('USUARIO só gerencia área que não atende', async () => {
      const x = await cenario()
      const hAdmin = await headersDe(x.admin.id)
      const ok = await patchUsuario(app, x.colega.id, hAdmin, { areasGeridasIds: [x.setor.id] })
      expect(ok.statusCode).toBe(200)
      expect(ok.json().areasGeridasIds).toEqual([x.setor.id])
      const atende = await patchUsuario(app, x.colega.id, hAdmin, { areasGeridasIds: [x.atendimento.id] })
      expect(atende.statusCode).toBe(422)
      expect((await patchUsuario(app, x.colega.id, hAdmin, { areasGeridasIds: [999_999] })).statusCode).toBe(422)
      expect(
        (await patchUsuario(app, x.colega.id, hAdmin, { areasGeridasIds: [x.setor.id, x.setor.id] })).statusCode,
      ).toBe(400)
      const limpo = await patchUsuario(app, x.colega.id, hAdmin, { areasGeridasIds: [] })
      expect(limpo.json().areasGeridasIds).toEqual([])
    })

    it('OPERADOR só gerencia áreas entre as suas; mudar as áreas poda a gestão que perdeu a base', async () => {
      const x = await cenario()
      const hAdmin = await headersDe(x.admin.id)
      const fora = await patchUsuario(app, x.operador.id, hAdmin, { areasGeridasIds: [x.setor.id] })
      expect(fora.statusCode).toBe(422)
      const dentro = await patchUsuario(app, x.operador.id, hAdmin, { areasGeridasIds: [x.atendimento.id] })
      expect(dentro.statusCode).toBe(200)
      expect(dentro.json().areasGeridasIds).toEqual([x.atendimento.id])
      const outraArea = await criarArea({ nome: 'RH' })
      const troca = await patchUsuario(app, x.operador.id, hAdmin, { areaId: outraArea.id })
      expect(troca.statusCode).toBe(200)
      expect(troca.json().areasGeridasIds).toEqual([])
      expect(await prisma.areaGerente.count({ where: { usuarioId: x.operador.id } })).toBe(0)
    })
  })
})
