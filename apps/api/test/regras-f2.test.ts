import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type App, buildApp } from '../src/app'
import { invalidarConfig } from '../src/lib/config'
import { prisma } from '../src/lib/prisma'
import { criarArea, criarUsuario, headersDe, limparBanco } from './ajudantes'
import { criarChamado, criarProblema, semearBase } from './fabricas'

async function definirConfig(chave: string, valor: boolean) {
  await prisma.config.upsert({ where: { chave }, create: { chave, valor }, update: { valor } })
  invalidarConfig()
}

describe('regras da fase 2: inventário por área (A17), operador trata o próprio (A19), abrir para outros (B03)', () => {
  let app: App

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    invalidarConfig()
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
    invalidarConfig()
    await semearBase()
  })

  describe('A17: módulo de inventário por área', () => {
    const rotas = ['/api/v1/ativos'] as const

    it('OPERADOR sem nenhuma área com o módulo recebe 403; com ao menos uma, 200; ADMIN sempre acessa', async () => {
      const semModulo = await criarArea({ nome: 'Sem módulo' })
      const comModulo = await criarArea({ nome: 'Com módulo' })
      await prisma.area.update({ where: { id: semModulo.id }, data: { moduloInventario: false } })
      const operador = await criarUsuario({ perfil: 'OPERADOR', areaId: semModulo.id })
      const admin = await criarUsuario({ perfil: 'ADMIN' })
      for (const url of rotas) {
        const negado = await app.inject({ method: 'GET', url, headers: await headersDe(operador.id) })
        expect(negado.statusCode).toBe(403)
        expect(negado.json().erro.codigo).toBe('SEM_PERMISSAO')
        expect((await app.inject({ method: 'GET', url, headers: await headersDe(admin.id) })).statusCode).toBe(200)
      }
      // uma área secundária com o módulo basta
      await prisma.usuarioArea.create({ data: { usuarioId: operador.id, areaId: comModulo.id } })
      for (const url of rotas) {
        expect((await app.inject({ method: 'GET', url, headers: await headersDe(operador.id) })).statusCode).toBe(200)
      }
    })

    it('o cadastro de área liga e desliga o módulo (padrão: ligado)', async () => {
      const admin = await criarUsuario({ perfil: 'ADMIN' })
      const headers = await headersDe(admin.id)
      const criada = await app.inject({
        method: 'POST',
        url: '/api/v1/areas',
        headers,
        payload: { nome: 'Oficina', atende: true, ativo: true, jornadaId: null },
      })
      expect(criada.json().moduloInventario).toBe(true)
      const off = await app.inject({
        method: 'PATCH',
        url: `/api/v1/areas/${criada.json().id}`,
        headers,
        payload: { moduloInventario: false },
      })
      expect(off.statusCode).toBe(200)
      expect(off.json().moduloInventario).toBe(false)
    })

    it('a escrita também respeita a regra', async () => {
      const semModulo = await criarArea({ nome: 'Sem módulo' })
      await prisma.area.update({ where: { id: semModulo.id }, data: { moduloInventario: false } })
      const operador = await criarUsuario({ perfil: 'OPERADOR', areaId: semModulo.id })
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/ativos',
        headers: await headersDe(operador.id),
        payload: {},
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('A19: chamado.operadorTrataProprio', () => {
    async function cenario() {
      const area = await criarArea()
      const operador = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
      const colega = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
      const proprio = await criarChamado({ solicitanteId: operador.id, areaId: area.id, papel: 'INICIAL' })
      const alheio = await criarChamado({ solicitanteId: colega.id, areaId: area.id, papel: 'INICIAL' })
      return { operador, proprio, alheio, headers: await headersDe(operador.id) }
    }
    const assumir = async (id: number, headers: Record<string, string>) => {
      const versao = (await prisma.chamado.findUniqueOrThrow({ where: { id }, select: { versao: true } })).versao
      return app.inject({ method: 'POST', url: `/api/v1/chamados/${id}/assumir`, headers, payload: { versao } })
    }

    it('com true (padrão), o operador atende o chamado em que é solicitante', async () => {
      const x = await cenario()
      expect((await assumir(x.proprio.id, x.headers)).statusCode).toBe(200)
    })

    it('com false, não atende o próprio (403, sem ações de atendimento), mas atende os dos outros', async () => {
      const x = await cenario()
      await definirConfig('chamado.operadorTrataProprio', false)
      const res = await assumir(x.proprio.id, x.headers)
      expect(res.statusCode).toBe(403)
      const detalhe = await app.inject({ method: 'GET', url: `/api/v1/chamados/${x.proprio.id}`, headers: x.headers })
      expect(detalhe.statusCode).toBe(200)
      expect(detalhe.json().acoes).toMatchObject({ assumir: false, concluir: false, encaminhar: false })
      expect((await assumir(x.alheio.id, x.headers)).statusCode).toBe(200)
    })
  })

  describe('B03: chamado.usuarioAbreParaOutros', () => {
    async function cenario() {
      const area = await criarArea()
      const problema = await criarProblema({ areaIds: [area.id], areaPadraoId: area.id })
      const unidade = await prisma.unidade.create({ data: { nome: 'Matriz' }, select: { id: true } })
      const dep1 = await prisma.departamento.create({
        data: { nome: 'Vendas', unidadeId: unidade.id },
        select: { id: true },
      })
      const dep2 = await prisma.departamento.create({
        data: { nome: 'Compras', unidadeId: unidade.id },
        select: { id: true },
      })
      const eu = await criarUsuario({ perfil: 'USUARIO' })
      const colega = await criarUsuario({ perfil: 'USUARIO' })
      const deOutroDep = await criarUsuario({ perfil: 'USUARIO' })
      const gestor = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
      await prisma.usuario.update({ where: { id: eu.id }, data: { departamentoId: dep1.id, nome: 'Eu Mesmo' } })
      await prisma.usuario.update({ where: { id: colega.id }, data: { departamentoId: dep1.id, nome: 'Carlos Silva' } })
      await prisma.usuario.update({
        where: { id: deOutroDep.id },
        data: { departamentoId: dep2.id, nome: 'Carla Souza' },
      })
      await prisma.usuario.update({
        where: { id: gestor.id },
        data: { departamentoId: dep1.id, nome: 'Carol Operadora' },
      })
      return { problema, eu, colega, deOutroDep, gestor, headers: await headersDe(eu.id) }
    }
    const abrir = (x: Awaited<ReturnType<typeof cenario>>, solicitanteId: number) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/chamados',
        headers: x.headers,
        payload: {
          assunto: 'Chamado para colega',
          descricao: 'Descrição do chamado.',
          problemaId: x.problema.id,
          solicitanteId,
        },
      })

    it('com false (padrão), USUARIO só abre em seu nome', async () => {
      const x = await cenario()
      expect((await abrir(x, x.colega.id)).statusCode).toBe(403)
    })

    it('com true, abre para alguém do mesmo departamento; outro departamento, equipe ou inexistente dão 403', async () => {
      const x = await cenario()
      await definirConfig('chamado.usuarioAbreParaOutros', true)
      const ok = await abrir(x, x.colega.id)
      expect(ok.statusCode).toBe(201)
      expect(ok.json().solicitante).toMatchObject({ id: x.colega.id })
      expect(ok.json().abertoPor).toMatchObject({ id: x.eu.id })
      expect((await abrir(x, x.deOutroDep.id)).statusCode).toBe(403)
      expect((await abrir(x, x.gestor.id)).statusCode).toBe(403)
      expect((await abrir(x, 999_999)).statusCode).toBe(403)
      expect((await abrir(x, x.eu.id)).statusCode).toBe(201)
    })

    it('sem departamento próprio, não abre para ninguém', async () => {
      const x = await cenario()
      await definirConfig('chamado.usuarioAbreParaOutros', true)
      await prisma.usuario.update({ where: { id: x.eu.id }, data: { departamentoId: null } })
      expect((await abrir(x, x.colega.id)).statusCode).toBe(403)
    })

    it('GET /usuarios/mesmo-departamento: só quem é do mesmo departamento, sem a própria pessoa; vazio com a regra desligada', async () => {
      const x = await cenario()
      const url = '/api/v1/usuarios/mesmo-departamento?q=car'
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401)
      const desligada = await app.inject({ method: 'GET', url, headers: x.headers })
      expect(desligada.statusCode).toBe(200)
      expect(desligada.json()).toEqual([])
      await definirConfig('chamado.usuarioAbreParaOutros', true)
      const res = await app.inject({ method: 'GET', url, headers: x.headers })
      expect(res.json()).toEqual([{ id: x.colega.id, nome: 'Carlos Silva' }]) // Carla é de outro depto; Carol é equipe
      const curta = await app.inject({
        method: 'GET',
        url: '/api/v1/usuarios/mesmo-departamento?q=c',
        headers: x.headers,
      })
      expect(curta.statusCode).toBe(400)
      const eu = await app.inject({
        method: 'GET',
        url: '/api/v1/usuarios/mesmo-departamento?q=eu',
        headers: x.headers,
      })
      expect(eu.json()).toEqual([])
    })
  })
})
