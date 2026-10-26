import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type App, buildApp } from '../src/app'
import { autoEncerrarPorInatividade } from '../src/jobs/chamados-auto-encerramento-inatividade'
import { JOBS } from '../src/jobs/index'
import { invalidarConfig } from '../src/lib/config'
import { prisma } from '../src/lib/prisma'
import { criarArea, criarUsuario, headersDe, limparBanco, ORIGEM } from './ajudantes'
import { type BaseSemeada, criarChamado, semearBase } from './fabricas'

const DIA = 24 * 60 * 60 * 1000
// sexta-feira, 12:00 UTC
const INICIO = new Date('2026-06-05T12:00:00Z')
const depoisDe = (dias: number) => new Date(INICIO.getTime() + dias * DIA + 60_000)

describe('solicitar retorno e auto-encerramento por inatividade (C18, C19)', () => {
  let app: App
  let base: BaseSemeada

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
    base = await semearBase()
  })

  const definirConfig = async (chave: string, valor: unknown) => {
    await prisma.config.upsert({
      where: { chave },
      create: { chave, valor: valor as never },
      update: { valor: valor as never },
    })
    invalidarConfig()
  }
  const monitorarAguardando = () => definirConfig('inatividade.statusIds', [base.statusPorPapel.AGUARDANDO_SOLICITANTE])
  const estado = (id: number) => prisma.chamado.findUniqueOrThrow({ where: { id } })

  async function cenario() {
    const area = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
    const aguardando = await criarChamado({
      solicitanteId: sol.id,
      areaId: area.id,
      papel: 'AGUARDANDO_SOLICITANTE',
      operadorId: op.id,
      abertoEm: INICIO,
    })
    return { area, sol, op, aguardando }
  }

  describe('job de auto-encerramento', () => {
    it('agenda a cada 15 minutos', () => {
      expect(JOBS.find((j) => j.fila === 'chamados-auto-encerramento-inatividade')?.cron).toBe('*/15 * * * *')
    })

    it('encerra no dia 8 e não no dia 6 (dias = 7), com avaliação automática, evento e comentário de sistema', async () => {
      const x = await cenario()
      await monitorarAguardando()
      await definirConfig('inatividade.avaliacao', 'BOM')

      expect(await autoEncerrarPorInatividade(depoisDe(6))).toBe(0)
      expect((await estado(x.aguardando.id)).statusTipo).toBe('PENDENTE')

      expect(await autoEncerrarPorInatividade(depoisDe(7))).toBe(1)
      const e = await estado(x.aguardando.id)
      expect(e.statusTipo).toBe('ENCERRADO')
      expect(e.encerradoEm).not.toBeNull()
      expect(await prisma.avaliacaoChamado.findUniqueOrThrow({ where: { chamadoId: x.aguardando.id } })).toMatchObject({
        nota: 'BOM',
        automatica: true,
        avaliadorId: null,
      })
      expect(
        await prisma.chamadoEvento.count({
          where: { chamadoId: x.aguardando.id, tipo: 'AUTO_ENCERRADO', atorId: null },
        }),
      ).toBe(1)
      expect(await prisma.assentamento.count({ where: { chamadoId: x.aguardando.id, evento: 'AUTO_ENCERRADO' } })).toBe(
        1,
      )
    })

    it('rodar duas vezes não duplica evento, avaliação nem e-mail', async () => {
      const x = await cenario()
      await monitorarAguardando()
      await definirConfig('email.habilitado', true)

      expect(await autoEncerrarPorInatividade(depoisDe(8))).toBe(1)
      expect(await autoEncerrarPorInatividade(depoisDe(8))).toBe(0)
      expect(await prisma.chamadoEvento.count({ where: { tipo: 'AUTO_ENCERRADO' } })).toBe(1)
      expect(await prisma.avaliacaoChamado.count()).toBe(1)
      const emails = await prisma.emailSaida.findMany({ where: { chamadoId: x.aguardando.id } })
      expect(emails).toHaveLength(1)
      expect(emails[0]).toMatchObject({
        evento: 'encerramento_automatico',
        para: expect.stringContaining('@teste.local'),
      })
    })

    it('sem email.habilitado não enfileira e-mail', async () => {
      await cenario()
      await monitorarAguardando()
      expect(await autoEncerrarPorInatividade(depoisDe(8))).toBe(1)
      expect(await prisma.emailSaida.count()).toBe(0)
    })

    it('lista vazia desliga o recurso e status não monitorado é ignorado', async () => {
      const x = await cenario()
      expect(await autoEncerrarPorInatividade(depoisDe(30))).toBe(0)
      await definirConfig('inatividade.statusIds', [base.statusPorPapel.EM_ATENDIMENTO])
      expect(await autoEncerrarPorInatividade(depoisDe(30))).toBe(0)
      expect((await estado(x.aguardando.id)).statusTipo).toBe('PENDENTE')
    })

    it('ignora quando o solicitante é o responsável ou o último comentário público é dele', async () => {
      const x = await cenario()
      await monitorarAguardando()
      const meuProprio = await criarChamado({
        solicitanteId: x.op.id,
        areaId: x.area.id,
        papel: 'AGUARDANDO_SOLICITANTE',
        operadorId: x.op.id,
        abertoEm: INICIO,
      })
      await prisma.chamado.update({ where: { id: x.aguardando.id }, data: { ultimaInteracaoAutorId: x.sol.id } })

      expect(await autoEncerrarPorInatividade(depoisDe(10))).toBe(0)
      expect((await estado(meuProprio.id)).statusTipo).toBe('PENDENTE')

      // o último comentário passa a ser da equipe: volta a ser candidato
      await prisma.chamado.update({ where: { id: x.aguardando.id }, data: { ultimaInteracaoAutorId: x.op.id } })
      expect(await autoEncerrarPorInatividade(depoisDe(10))).toBe(1)
    })

    it('com diasUteis respeita o fim de semana (dias = 1, sexta 12:00 → segunda 12:00)', async () => {
      const area = await criarArea()
      const sol = await criarUsuario({ perfil: 'USUARIO' })
      const c = await criarChamado({
        solicitanteId: sol.id,
        areaId: area.id,
        papel: 'AGUARDANDO_SOLICITANTE',
        abertoEm: INICIO,
        jornadaId: base.jornadaComercialId,
      })
      await monitorarAguardando()
      await definirConfig('inatividade.dias', 1)
      await definirConfig('inatividade.diasUteis', true)

      // domingo: corridos já venceriam, úteis não
      expect(await autoEncerrarPorInatividade(new Date('2026-06-07T12:00:00Z'))).toBe(0)
      expect((await estado(c.id)).statusTipo).toBe('PENDENTE')
      expect(await autoEncerrarPorInatividade(new Date('2026-06-08T13:00:00Z'))).toBe(1)
      expect((await estado(c.id)).statusTipo).toBe('ENCERRADO')
    })

    it('sem diasUteis, o mesmo prazo vence no fim de semana', async () => {
      const x = await cenario()
      await monitorarAguardando()
      await definirConfig('inatividade.dias', 1)
      expect(await autoEncerrarPorInatividade(new Date('2026-06-07T12:00:00Z'))).toBe(1)
      expect((await estado(x.aguardando.id)).statusTipo).toBe('ENCERRADO')
    })
  })

  describe('POST /chamados/:id/solicitar-retorno', () => {
    const post = (id: number, headers: Record<string, string>, payload: unknown) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/chamados/${id}/solicitar-retorno`,
        headers,
        payload: payload as never,
      })

    async function emAtendimento() {
      const area = await criarArea()
      const sol = await criarUsuario({ perfil: 'USUARIO' })
      const op = await criarUsuario({ perfil: 'OPERADOR', areaId: area.id })
      const c = await criarChamado({
        solicitanteId: sol.id,
        areaId: area.id,
        papel: 'EM_ATENDIMENTO',
        operadorId: op.id,
      })
      return { area, sol, op, c }
    }

    it('401 sem sessão, 403 para USUARIO', async () => {
      const x = await emAtendimento()
      const semSessao = await app.inject({
        method: 'POST',
        url: `/api/v1/chamados/${x.c.id}/solicitar-retorno`,
        headers: { origin: ORIGEM },
        payload: { versao: 0, mensagem: 'Preciso de mais dados.' },
      })
      expect(semSessao.statusCode).toBe(401)
      const r = await post(x.c.id, await headersDe(x.sol.id), { versao: 0, mensagem: 'Preciso de mais dados.' })
      expect(r.statusCode).toBe(403)
    })

    it('404 fora do escopo', async () => {
      const x = await emAtendimento()
      const outro = await criarUsuario({ perfil: 'OPERADOR', areaId: (await criarArea()).id })
      const r = await post(x.c.id, await headersDe(outro.id), { versao: 0, mensagem: 'Preciso de mais dados.' })
      expect(r.statusCode).toBe(404)
    })

    it('409 por versão desatualizada', async () => {
      const x = await emAtendimento()
      const r = await post(x.c.id, await headersDe(x.op.id), { versao: 7, mensagem: 'Preciso de mais dados.' })
      expect(r.statusCode).toBe(409)
      expect((await estado(x.c.id)).statusTipo).toBe('EM_ATENDIMENTO')
    })

    it('400 com detalhes para corpo inválido', async () => {
      const x = await emAtendimento()
      const h = await headersDe(x.op.id)
      const curta = await post(x.c.id, h, { versao: 0, mensagem: 'a' })
      expect(curta.statusCode).toBe(400)
      expect(curta.json().erro.detalhes).toBeDefined()
      const extra = await post(x.c.id, h, { versao: 0, mensagem: 'Preciso de mais dados.', extra: 1 })
      expect(extra.statusCode).toBe(400)
    })

    it('caminho feliz: comentário público, status aguardando, evento e e-mail na outbox', async () => {
      const x = await emAtendimento()
      await definirConfig('email.habilitado', true)
      const r = await post(x.c.id, await headersDe(x.op.id), { versao: 0, mensagem: 'Qual é o número de série?' })
      expect(r.statusCode).toBe(200)

      const e = await estado(x.c.id)
      expect(e.statusId).toBe(base.statusPorPapel.AGUARDANDO_SOLICITANTE)
      expect(e.statusTipo).toBe('PENDENTE')
      expect(e.versao).toBe(1)
      expect(
        await prisma.assentamento.count({
          where: { chamadoId: x.c.id, autorId: x.op.id, interno: false, texto: 'Qual é o número de série?' },
        }),
      ).toBe(1)
      expect(await prisma.chamadoEvento.count({ where: { chamadoId: x.c.id, tipo: 'SOLICITADO_RETORNO' } })).toBe(1)
      const emails = await prisma.emailSaida.findMany({ where: { chamadoId: x.c.id } })
      expect(emails).toHaveLength(1)
      expect(emails[0]).toMatchObject({ evento: 'solicitacao_retorno', usuarioId: x.sol.id })
      expect(emails[0]?.texto).not.toContain('número de série') // o comentário nunca vai no e-mail

      // repetir com o chamado já aguardando: regra de negócio
      const denovo = await post(x.c.id, await headersDe(x.op.id), { versao: 1, mensagem: 'Qual é o número de série?' })
      expect(denovo.statusCode).toBe(422)
    })

    it('sem email.habilitado não grava e-mail', async () => {
      const x = await emAtendimento()
      const r = await post(x.c.id, await headersDe(x.op.id), { versao: 0, mensagem: 'Pode detalhar o erro?' })
      expect(r.statusCode).toBe(200)
      expect(await prisma.emailSaida.count()).toBe(0)
    })
  })

  describe('comentário do solicitante em status monitorado', () => {
    const comentar = async (chamadoId: number, usuarioId: number) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/chamados/${chamadoId}/assentamentos`,
        headers: await headersDe(usuarioId),
        payload: { texto: 'Segue a informação pedida.', interno: false, clienteId: randomUUID() },
      })

    it('leva o chamado a inatividade.statusRetornoId', async () => {
      const x = await cenario()
      await monitorarAguardando()
      await definirConfig('inatividade.statusRetornoId', base.statusPorPapel.INICIAL)

      const r = await comentar(x.aguardando.id, x.sol.id)
      expect(r.statusCode).toBe(201)
      expect(await estado(x.aguardando.id)).toMatchObject({
        statusId: base.statusPorPapel.INICIAL,
        statusTipo: 'ABERTO',
      })
    })

    it('sem statusRetornoId mantém o comportamento antigo (papel EM_ATENDIMENTO)', async () => {
      const x = await cenario()
      const r = await comentar(x.aguardando.id, x.sol.id)
      expect(r.statusCode).toBe(201)
      expect((await estado(x.aguardando.id)).statusId).toBe(base.statusPorPapel.EM_ATENDIMENTO)
    })

    it('comentário da equipe não muda o status', async () => {
      const x = await cenario()
      await monitorarAguardando()
      const r = await comentar(x.aguardando.id, x.op.id)
      expect(r.statusCode).toBe(201)
      expect((await estado(x.aguardando.id)).statusTipo).toBe('PENDENTE')
    })
  })

  describe('configuração', () => {
    const patch = async (payload: unknown) =>
      app.inject({
        method: 'PATCH',
        url: '/api/v1/config',
        headers: await headersDe((await criarUsuario({ perfil: 'ADMIN' })).id),
        payload: payload as never,
      })

    it('aceita valores válidos e devolve os padrões das chaves novas', async () => {
      const r = await patch({
        'inatividade.statusIds': [base.statusPorPapel.AGUARDANDO_SOLICITANTE],
        'inatividade.dias': 5,
        'inatividade.diasUteis': true,
        'inatividade.statusRetornoId': base.statusPorPapel.INICIAL,
        'inatividade.avaliacao': 'REGULAR',
      })
      expect(r.statusCode).toBe(200)
      expect(r.json()).toMatchObject({ 'inatividade.dias': 5, 'inatividade.avaliacao': 'REGULAR' })
    })

    it('rejeita dias fora do intervalo, nota inválida, status de retorno de outro tipo e status inexistente', async () => {
      expect((await patch({ 'inatividade.dias': 0 })).statusCode).toBe(400)
      expect((await patch({ 'inatividade.avaliacao': 'PESSIMO' })).statusCode).toBe(400)
      expect((await patch({ 'inatividade.statusRetornoId': base.statusPorPapel.ENCERRADO })).statusCode).toBe(422)
      expect((await patch({ 'inatividade.statusIds': [999999] })).statusCode).toBe(422)
    })
  })
})
