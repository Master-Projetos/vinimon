import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { type BaseSemeada, criarChamado, criarProblema, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { invalidarConfig } from '../../lib/config'
import { prisma } from '../../lib/prisma'
import { definirTempoReal, type PublicadorTempoReal, tempoReal } from '../../lib/tempo-real'

const espiao = () => ({
  encerrarSessao: vi.fn(),
  encerrarSessoesDoUsuario: vi.fn(),
  revalidarUsuario: vi.fn(),
  revalidarChamado: vi.fn(),
  emitirAssentamentos: vi.fn(),
  emitirChamadoAtualizado: vi.fn(),
  emitirFila: vi.fn(),
  emitirLeitura: vi.fn(),
  emitirNotificacoes: vi.fn(),
  emitirContagem: vi.fn(),
})

describe('ações de conclusão: concluir, aprovar e rejeitar (C13, C14)', () => {
  let app: App
  let base: BaseSemeada
  const original: PublicadorTempoReal = tempoReal

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(async () => {
    await limparBanco()
    invalidarConfig()
    base = await semearBase()
    definirTempoReal(espiao())
  })
  afterEach(() => {
    definirTempoReal(original)
  })

  const post = (id: number, acao: string, headers: Record<string, string>, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/v1/chamados/${id}/${acao}`, headers, payload })
  const estado = (id: number) => prisma.chamado.findUniqueOrThrow({ where: { id } })
  const definirConfig = async (chave: string, valor: unknown) => {
    await prisma.config.upsert({
      where: { chave },
      create: { chave, valor: valor as never },
      update: { valor: valor as never },
    })
    invalidarConfig()
  }

  async function cenario() {
    const A = await criarArea()
    const problema = await criarProblema({
      areaIds: [A.id],
      areaPadraoId: A.id,
      slaSolucaoMin: 480,
      slaRespostaMin: 60,
    })
    const u1 = await criarUsuario({ perfil: 'USUARIO' })
    const o1 = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const novo = (papel: Parameters<typeof criarChamado>[0]['papel'], operadorId?: number, solicitanteId = u1.id) =>
      criarChamado({
        solicitanteId,
        areaId: A.id,
        problemaId: problema.id,
        slaSolucaoMin: 480,
        slaRespostaMin: 60,
        ...(papel ? { papel } : {}),
        ...(operadorId ? { operadorId } : {}),
      })
    return { A, u1, o1, novo, hU1: await headersDe(u1.id), hO1: await headersDe(o1.id) }
  }

  describe('concluir', () => {
    it('vai para CONCLUIDO com solução, operador assumido, prazo de validação, 1ª resposta e evento', async () => {
      const x = await cenario()
      const c = await x.novo('INICIAL')
      const res = await post(c.id, 'concluir', x.hO1, {
        versao: 0,
        solucao: 'Reiniciei o serviço.',
        descricaoTecnica: 'systemctl',
      })
      expect(res.statusCode).toBe(200)
      const e = await estado(c.id)
      expect(e).toMatchObject({
        statusTipo: 'CONCLUIDO',
        operadorId: x.o1.id,
        solucao: 'Reiniciei o serviço.',
        descricaoTecnica: 'systemctl',
      })
      expect(e.concluidoEm).not.toBeNull()
      expect(e.encerradoEm).toBeNull()
      expect(e.primeiraRespostaEm).not.toBeNull()
      expect(e.validacaoLimiteEm).not.toBeNull()
      expect(e.validacaoLimiteEm?.getTime()).toBeGreaterThan(e.concluidoEm?.getTime() ?? Infinity)
      const ev = await prisma.chamadoEvento.findMany({ where: { chamadoId: c.id, tipo: 'CONCLUIDO' } })
      expect(ev).toHaveLength(1)
    })

    it('prazo de validação em dias corridos soma N dias', async () => {
      const x = await cenario()
      await definirConfig('chamado.prazoValidacaoDiasUteis', false)
      await definirConfig('chamado.prazoValidacaoDias', 2)
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      await post(c.id, 'concluir', x.hO1, { versao: 0, solucao: 'ok' })
      const e = await estado(c.id)
      const dias = ((e.validacaoLimiteEm?.getTime() ?? 0) - (e.concluidoEm?.getTime() ?? 0)) / 86_400_000
      expect(Math.round(dias)).toBe(2)
    })

    it('prazo 0 encerra direto', async () => {
      const x = await cenario()
      await definirConfig('chamado.prazoValidacaoDias', 0)
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      const res = await post(c.id, 'concluir', x.hO1, { versao: 0, solucao: 'ok' })
      expect(res.statusCode).toBe(200)
      const e = await estado(c.id)
      expect(e).toMatchObject({ statusTipo: 'ENCERRADO', validacaoLimiteEm: null })
      expect(e.encerradoEm).not.toBeNull()
    })

    it('o solicitante como operador encerra direto', async () => {
      const x = await cenario()
      const op = await criarUsuario({ perfil: 'OPERADOR', areaId: x.A.id })
      const c = await x.novo('EM_ATENDIMENTO', op.id, op.id)
      const res = await post(c.id, 'concluir', await headersDe(op.id), { versao: 0, solucao: 'feito' })
      expect(res.statusCode).toBe(200)
      expect((await estado(c.id)).statusTipo).toBe('ENCERRADO')
    })

    it('400 sem solução, 403 para o solicitante, 404 fora do escopo e 409 com versão velha', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      expect((await post(c.id, 'concluir', x.hO1, { versao: 0 })).statusCode).toBe(400)
      expect((await post(c.id, 'concluir', x.hU1, { versao: 0, solucao: 'ok' })).statusCode).toBe(403)
      const outraArea = await criarArea()
      const outra = await criarUsuario({ perfil: 'OPERADOR', areaId: outraArea.id })
      expect((await post(c.id, 'concluir', await headersDe(outra.id), { versao: 0, solucao: 'ok' })).statusCode).toBe(
        404,
      )
      expect((await post(c.id, 'concluir', x.hO1, { versao: 7, solucao: 'ok' })).statusCode).toBe(409)
      expect((await estado(c.id)).statusTipo).toBe('EM_ATENDIMENTO')
    })

    it('401 sem sessão', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/chamados/1/concluir',
        headers: { origin: ORIGEM },
        payload: { versao: 0, solucao: 'x' },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('aprovar', () => {
    it('solicitante aprova: ENCERRADO, avaliação não automática e evento APROVADO', async () => {
      const x = await cenario()
      const c = await x.novo('CONCLUIDO', x.o1.id)
      const res = await post(c.id, 'aprovar', x.hU1, { versao: 0, nota: 'BOM', comentario: 'valeu' })
      expect(res.statusCode).toBe(200)
      expect((await estado(c.id)).statusTipo).toBe('ENCERRADO')
      expect(await prisma.avaliacaoChamado.findUniqueOrThrow({ where: { chamadoId: c.id } })).toMatchObject({
        nota: 'BOM',
        comentario: 'valeu',
        automatica: false,
        avaliadorId: x.u1.id,
      })
      expect(await prisma.chamadoEvento.count({ where: { chamadoId: c.id, tipo: 'APROVADO' } })).toBe(1)
    })

    it('não solicitante aprovando dá 403; chamado fora de CONCLUIDO também', async () => {
      const x = await cenario()
      const c = await x.novo('CONCLUIDO', x.o1.id)
      expect((await post(c.id, 'aprovar', x.hO1, { versao: 0, nota: 'BOM' })).statusCode).toBe(403)
      const aberto = await x.novo('EM_ATENDIMENTO', x.o1.id)
      expect((await post(aberto.id, 'aprovar', x.hU1, { versao: 0, nota: 'BOM' })).statusCode).toBe(403)
      expect(await prisma.avaliacaoChamado.count()).toBe(0)
    })

    it('400 com nota inválida', async () => {
      const x = await cenario()
      const c = await x.novo('CONCLUIDO', x.o1.id)
      expect((await post(c.id, 'aprovar', x.hU1, { versao: 0, nota: 'EXCELENTE' })).statusCode).toBe(400)
    })
  })

  describe('rejeitar', () => {
    it('motivo vira comentário público; volta a EM_ATENDIMENTO com o operador, rejeicoes+1 e o SLA volta a correr', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      await post(c.id, 'concluir', x.hO1, { versao: 0, solucao: 'ok' })
      const concluido = await estado(c.id)
      expect(concluido.slaPausado).toBe(true)

      const res = await post(c.id, 'rejeitar', x.hU1, { versao: concluido.versao, motivo: 'Continua sem funcionar.' })
      expect(res.statusCode).toBe(200)
      const e = await estado(c.id)
      expect(e).toMatchObject({
        statusTipo: 'EM_ATENDIMENTO',
        operadorId: x.o1.id,
        rejeicoes: 1,
        concluidoEm: null,
        slaPausado: false,
      })
      expect(e.prazoSolucaoEm).not.toBeNull()
      const comentario = await prisma.assentamento.findFirstOrThrow({
        where: { chamadoId: c.id, tipo: 'COMENTARIO', autorId: x.u1.id },
      })
      expect(comentario).toMatchObject({ texto: 'Continua sem funcionar.', interno: false })
      expect(await prisma.chamadoEvento.count({ where: { chamadoId: c.id, tipo: 'REJEITADO' } })).toBe(1)
    })

    it('com o operador inativo volta a INICIAL sem operador', async () => {
      const x = await cenario()
      const c = await x.novo('CONCLUIDO', x.o1.id)
      await prisma.usuario.update({ where: { id: x.o1.id }, data: { ativo: false } })
      const res = await post(c.id, 'rejeitar', x.hU1, { versao: 0, motivo: 'Não resolveu o problema.' })
      expect(res.statusCode).toBe(200)
      expect(await estado(c.id)).toMatchObject({ statusTipo: 'ABERTO', operadorId: null, rejeicoes: 1 })
    })

    it('não solicitante dá 403 e motivo curto dá 400', async () => {
      const x = await cenario()
      const c = await x.novo('CONCLUIDO', x.o1.id)
      expect((await post(c.id, 'rejeitar', x.hO1, { versao: 0, motivo: 'Motivo válido aqui.' })).statusCode).toBe(403)
      expect((await post(c.id, 'rejeitar', x.hU1, { versao: 0, motivo: 'ab' })).statusCode).toBe(400)
      expect(base.statusPorPapel.INICIAL).toBeGreaterThan(0)
    })
  })
})
