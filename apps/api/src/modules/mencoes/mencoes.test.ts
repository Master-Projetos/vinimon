import { serializarMencao } from '@vinimon/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { criarChamado } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'
import { validarMencoes } from './service'

describe('módulo menções', () => {
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

  const token = (id: number, nome: string) => serializarMencao({ id, nome })

  async function cenario() {
    const area = await criarArea()
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const operador = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
    const chamado = await criarChamado({ solicitanteId: solicitante.id, areaId: area.id, operadorId: operador.id })
    return { area, solicitante, operador, chamado }
  }

  const validar = (
    chamado: { areaId: number; operadorId: number | null; solicitanteId: number },
    texto: string,
    interno: boolean,
  ) =>
    prisma.$transaction((tx) =>
      validarMencoes(tx, { ...chamado, solicitanteAreaId: null, auxiliarIds: [] }, texto, interno),
    )

  describe('validarMencoes', () => {
    it('reescreve o token válido com o nome canônico do banco', async () => {
      const { operador, chamado } = await cenario()
      const dados = await prisma.usuario.findUniqueOrThrow({ where: { id: operador.id }, select: { nome: true } })
      const r = await validar(chamado, `Oi ${token(operador.id, 'Nome Falso')}!`, false)
      expect(r.texto).toBe(`Oi ${token(operador.id, dados.nome)}!`)
      expect(r.validos).toEqual([operador.id])
      expect(r.ignoradas).toEqual([])
    })

    it('T59: quem não vê o chamado vira @Nome e entra em ignoradas', async () => {
      const { chamado } = await cenario()
      const outro = await criarUsuario({ perfil: 'OPERADOR' })
      const r = await validar(chamado, `Veja ${token(outro.id, 'Fulano')}`, false)
      expect(r.texto).toBe('Veja @Fulano')
      expect(r.validos).toEqual([])
      expect(r.ignoradas).toEqual([{ id: outro.id, nome: 'Fulano' }])
    })

    it('T59: USUARIO só vale em mensagem pública; em interna é ignorado', async () => {
      const { solicitante, chamado } = await cenario()
      const publica = await validar(chamado, token(solicitante.id, 'X'), false)
      expect(publica.validos).toEqual([solicitante.id])
      const interna = await validar(chamado, token(solicitante.id, 'X'), true)
      expect(interna.validos).toEqual([])
      expect(interna.texto).toBe('@X')
      expect(interna.ignoradas).toEqual([{ id: solicitante.id, nome: 'X' }])
    })

    it('ignora inativos e ids inexistentes, sem repetir a ignorada', async () => {
      const { area, chamado } = await cenario()
      const inativo = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id, ativo: false })
      const texto = `${token(inativo.id, 'Inativo')} ${token(inativo.id, 'Inativo')} ${token(999999, 'Fantasma')}`
      const r = await validar(chamado, texto, false)
      expect(r.texto).toBe('@Inativo @Inativo @Fantasma')
      expect(r.ignoradas).toHaveLength(2)
    })

    it('vale operador com a área do chamado como secundária', async () => {
      const { area, chamado } = await cenario()
      const outro = await criarUsuario({ perfil: 'OPERADOR' })
      await prisma.usuarioArea.create({ data: { usuarioId: outro.id, areaId: area.id } })
      const r = await validar(chamado, token(outro.id, 'Y'), true)
      expect(r.validos).toEqual([outro.id])
    })

    it('T59: 21 menções distintas dão 400 VALIDACAO com detalhes; 20 passam e repetidas não contam', async () => {
      const { chamado } = await cenario()
      const tokens = (n: number) => Array.from({ length: n }, (_, i) => token(i + 1000, `N${i}`)).join(' ')
      const erro = await validar(chamado, tokens(21), false).catch((e: unknown) => e)
      expect(erro).toMatchObject({ status: 400, codigo: 'VALIDACAO' })
      expect(erro).toHaveProperty('detalhes.0.campo', 'texto')
      const r = await validar(chamado, `${tokens(20)} ${token(1000, 'N0')}`, false)
      expect(r.ignoradas).toHaveLength(20)
    })

    it('sem menções devolve o texto como está', async () => {
      const { chamado } = await cenario()
      expect(await validar(chamado, 'nada', false)).toEqual({ texto: 'nada', validos: [], ignoradas: [] })
    })
  })

  describe('GET /chamados/:id/mencionaveis', () => {
    const url = (id: number, qs = '') => `/api/v1/chamados/${id}/mencionaveis${qs}`

    it('401 sem sessão', async () => {
      const { chamado } = await cenario()
      const res = await app.inject({ method: 'GET', url: url(chamado.id) })
      expect(res.statusCode).toBe(401)
    })

    it('404 para chamado inexistente e fora do escopo', async () => {
      const { chamado } = await cenario()
      const alheio = await criarUsuario({ perfil: 'OPERADOR' })
      const headers = await headersDe(alheio.id)
      expect((await app.inject({ method: 'GET', url: url(chamado.id), headers })).statusCode).toBe(404)
      expect((await app.inject({ method: 'GET', url: url(999999), headers })).statusCode).toBe(404)
      const outroUsuario = await criarUsuario({ perfil: 'USUARIO' })
      const h2 = await headersDe(outroUsuario.id)
      expect((await app.inject({ method: 'GET', url: url(chamado.id), headers: h2 })).statusCode).toBe(404)
    })

    it('400 com detalhes para query inválida', async () => {
      const { operador, chamado } = await cenario()
      const headers = await headersDe(operador.id)
      for (const qs of ['?interno=talvez', '?x=1']) {
        const res = await app.inject({ method: 'GET', url: url(chamado.id, qs), headers })
        expect(res.statusCode).toBe(400)
        expect(res.json().erro.codigo).toBe('VALIDACAO')
        expect(res.json().erro.detalhes.length).toBeGreaterThan(0)
      }
    })

    it('caminho feliz: participantes primeiro, sem o próprio usuário, e operador de outra área nunca aparece', async () => {
      const { area, solicitante, operador, chamado } = await cenario()
      const colega = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
      const admin = await criarUsuario({ perfil: 'ADMIN' })
      const outraArea = await criarUsuario({ perfil: 'OPERADOR' })
      await prisma.usuario.update({ where: { id: colega.id }, data: { nome: 'Aaa Colega' } })
      await prisma.usuario.update({ where: { id: operador.id }, data: { nome: 'Zzz Operador' } })
      const headers = await headersDe(admin.id)
      const res = await app.inject({ method: 'GET', url: url(chamado.id), headers })
      expect(res.statusCode).toBe(200)
      const ids = res.json().map((m: { id: number }) => m.id)
      expect(ids).not.toContain(admin.id)
      expect(ids).not.toContain(outraArea.id)
      expect(ids.slice(0, 2).sort()).toEqual([solicitante.id, operador.id].sort())
      expect(ids[2]).toBe(colega.id)
      expect(res.json()[0]).toEqual({ id: expect.any(Number), nome: expect.any(String), perfil: expect.any(String) })

      const nomeOutra = await prisma.usuario.findUniqueOrThrow({ where: { id: outraArea.id }, select: { nome: true } })
      const busca = await app.inject({
        method: 'GET',
        url: url(chamado.id, `?q=${encodeURIComponent(nomeOutra.nome)}`),
        headers,
      })
      expect(busca.json()).toEqual([])
    })

    it('seguidor e autor de assentamento contam como participantes; filtro q por nome', async () => {
      const { area, operador, chamado } = await cenario()
      const seguidor = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
      const autor = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
      await prisma.usuario.update({
        where: { id: seguidor.id },
        data: { nome: 'Zeta Seguidor', buscaNorm: 'zeta seguidor' },
      })
      await prisma.usuario.update({ where: { id: autor.id }, data: { nome: 'Zeta Autor', buscaNorm: 'zeta autor' } })
      await prisma.chamadoSeguidor.create({
        data: { chamadoId: chamado.id, usuarioId: seguidor.id, motivo: 'MANUAL' },
      })
      await prisma.assentamento.create({
        data: { chamadoId: chamado.id, autorId: autor.id, texto: 'oi', interno: true },
      })
      const headers = await headersDe(operador.id)
      const res = await app.inject({ method: 'GET', url: url(chamado.id, '?q=ZETA'), headers })
      expect(res.statusCode).toBe(200)
      expect(res.json().map((m: { nome: string }) => m.nome)).toEqual(['Zeta Autor', 'Zeta Seguidor'])
    })

    it('limita a 8 resultados', async () => {
      const { area, operador, chamado } = await cenario()
      for (let i = 0; i < 10; i++) await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
      const headers = await headersDe(operador.id)
      const res = await app.inject({ method: 'GET', url: url(chamado.id), headers })
      expect(res.json()).toHaveLength(8)
    })

    it('USUARIO só vê participantes e, em interno, recebe lista vazia', async () => {
      const { area, solicitante, operador, chamado } = await cenario()
      await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
      const headers = await headersDe(solicitante.id)
      const res = await app.inject({ method: 'GET', url: url(chamado.id), headers })
      expect(res.json().map((m: { id: number }) => m.id)).toEqual([operador.id])
      const interno = await app.inject({ method: 'GET', url: url(chamado.id, '?interno=true'), headers })
      expect(interno.statusCode).toBe(200)
      expect(interno.json()).toEqual([])
    })

    it('interno=true lista só a equipe que vê o conteúdo interno', async () => {
      const { solicitante, operador, chamado } = await cenario()
      const admin = await criarUsuario({ perfil: 'ADMIN' })
      const headers = await headersDe(admin.id)
      const res = await app.inject({ method: 'GET', url: url(chamado.id, '?interno=true'), headers })
      const ids = res.json().map((m: { id: number }) => m.id)
      expect(ids).toEqual([operador.id])
      expect(ids).not.toContain(solicitante.id)
    })
  })
})
