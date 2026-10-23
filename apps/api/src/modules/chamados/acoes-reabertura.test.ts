import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { criarChamado, criarProblema, semearBase } from '../../../test/fabricas'
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

describe('ações de reabertura: reabrir, cancelar e seguir (C16, C17)', () => {
  let app: App
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
    await semearBase()
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
    const novo = (papel: Parameters<typeof criarChamado>[0]['papel'], operadorId?: number, abertoEm?: Date) =>
      criarChamado({
        solicitanteId: u1.id,
        areaId: A.id,
        problemaId: problema.id,
        slaSolucaoMin: 480,
        slaRespostaMin: 60,
        ...(papel ? { papel } : {}),
        ...(operadorId ? { operadorId } : {}),
        ...(abertoEm ? { abertoEm } : {}),
      })
    return { A, u1, o1, novo, hU1: await headersDe(u1.id), hO1: await headersDe(o1.id) }
  }
  const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000)

  describe('reabrir', () => {
    it('solicitante reabre: EM_ATENDIMENTO com o operador, datas limpas, avaliação apagada e guardada no evento', async () => {
      const x = await cenario()
      const c = await x.novo('ENCERRADO', x.o1.id)
      await prisma.avaliacaoChamado.create({
        data: { chamadoId: c.id, avaliadorId: x.u1.id, nota: 'RUIM', comentario: 'ruim' },
      })
      const res = await post(c.id, 'reabrir', x.hU1, { versao: 0, justificativa: 'O problema voltou.' })
      expect(res.statusCode).toBe(200)
      expect(await estado(c.id)).toMatchObject({
        statusTipo: 'EM_ATENDIMENTO',
        operadorId: x.o1.id,
        concluidoEm: null,
        encerradoEm: null,
      })
      expect(await prisma.avaliacaoChamado.count({ where: { chamadoId: c.id } })).toBe(0)
      const ev = await prisma.chamadoEvento.findFirstOrThrow({ where: { chamadoId: c.id, tipo: 'REABERTO' } })
      expect(ev.dados).toMatchObject({ avaliacaoAnterior: { nota: 'RUIM', comentario: 'ruim' } })
      expect(
        await prisma.assentamento.count({
          where: { chamadoId: c.id, tipo: 'COMENTARIO', texto: 'O problema voltou.' },
        }),
      ).toBe(1)
    })

    it('com o operador inativo volta a INICIAL sem operador', async () => {
      const x = await cenario()
      const c = await x.novo('ENCERRADO', x.o1.id)
      await prisma.usuario.update({ where: { id: x.o1.id }, data: { ativo: false } })
      expect((await post(c.id, 'reabrir', x.hU1, { versao: 0, justificativa: 'Voltou a falhar.' })).statusCode).toBe(
        200,
      )
      expect(await estado(c.id)).toMatchObject({ statusTipo: 'ABERTO', operadorId: null })
    })

    it('fora do prazo dá 422; dentro do prazo reabre', async () => {
      const x = await cenario()
      await definirConfig('chamado.prazoReaberturaDias', 2)
      const velho = await x.novo('ENCERRADO', x.o1.id, diasAtras(5))
      const res = await post(velho.id, 'reabrir', x.hU1, { versao: 0, justificativa: 'Tarde demais?' })
      expect(res.statusCode).toBe(422)
      expect(res.json().erro.codigo).toBe('REGRA_NEGOCIO')
      const recente = await x.novo('ENCERRADO', x.o1.id, diasAtras(1))
      expect(
        (await post(recente.id, 'reabrir', x.hU1, { versao: 0, justificativa: 'Dentro do prazo.' })).statusCode,
      ).toBe(200)
    })

    it('chamado cancelado dá 422; reabertura desativada dá 422; não encerrado dá 422', async () => {
      const x = await cenario()
      const cancelado = await x.novo('CANCELADO')
      expect(
        (await post(cancelado.id, 'reabrir', x.hU1, { versao: 0, justificativa: 'Quero reabrir.' })).statusCode,
      ).toBe(422)
      const aberto = await x.novo('EM_ATENDIMENTO', x.o1.id)
      expect((await post(aberto.id, 'reabrir', x.hU1, { versao: 0, justificativa: 'Quero reabrir.' })).statusCode).toBe(
        422,
      )
      await definirConfig('chamado.permitirReabertura', false)
      const encerrado = await x.novo('ENCERRADO', x.o1.id)
      expect(
        (await post(encerrado.id, 'reabrir', x.hU1, { versao: 0, justificativa: 'Quero reabrir.' })).statusCode,
      ).toBe(422)
    })

    it('403 para operador de outra pessoa (visível, mas não é o último operador), 404 fora do escopo e 409 com versão velha', async () => {
      const x = await cenario()
      const outroOp = await criarUsuario({ perfil: 'OPERADOR', areaId: x.A.id })
      const c = await x.novo('ENCERRADO', x.o1.id)
      const corpo = { versao: 0, justificativa: 'Quero reabrir.' }
      expect((await post(c.id, 'reabrir', await headersDe(outroOp.id), corpo)).statusCode).toBe(403)
      const estranho = await criarUsuario({ perfil: 'USUARIO' })
      expect((await post(c.id, 'reabrir', await headersDe(estranho.id), corpo)).statusCode).toBe(404)
      expect((await post(c.id, 'reabrir', x.hU1, { ...corpo, versao: 9 })).statusCode).toBe(409)
      expect((await post(c.id, 'reabrir', x.hO1, corpo)).statusCode).toBe(200) // o último operador também pode
    })
  })

  describe('cancelar', () => {
    it('solicitante cancela chamado ABERTO sem operador: CANCELADO, cancelado=true, datas = agora, motivo público', async () => {
      const x = await cenario()
      const c = await x.novo('INICIAL')
      const res = await post(c.id, 'cancelar', x.hU1, { versao: 0, motivo: 'Abri por engano.' })
      expect(res.statusCode).toBe(200)
      const e = await estado(c.id)
      expect(e).toMatchObject({ statusTipo: 'ENCERRADO', cancelado: true })
      expect(e.concluidoEm).not.toBeNull()
      expect(e.encerradoEm?.getTime()).toBe(e.concluidoEm?.getTime())
      expect(await prisma.avaliacaoChamado.count()).toBe(0)
      expect(await prisma.chamadoEvento.count({ where: { chamadoId: c.id, tipo: 'CANCELADO' } })).toBe(1)
      expect(
        await prisma.assentamento.count({ where: { chamadoId: c.id, texto: 'Abri por engano.', interno: false } }),
      ).toBe(1)
    })

    it('USUARIO cancelando com operador atribuído dá 403', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      expect((await post(c.id, 'cancelar', x.hU1, { versao: 0, motivo: 'Desisti do pedido.' })).statusCode).toBe(403)
      expect((await estado(c.id)).cancelado).toBe(false)
    })

    it('operador da área cancela em atendimento; chamado CONCLUIDO/ENCERRADO não cancela (403); motivo curto 400', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      expect((await post(c.id, 'cancelar', x.hO1, { versao: 0, motivo: 'ab' })).statusCode).toBe(400)
      expect((await post(c.id, 'cancelar', x.hO1, { versao: 0, motivo: 'Duplicado do #1.' })).statusCode).toBe(200)
      const concluido = await x.novo('CONCLUIDO', x.o1.id)
      expect((await post(concluido.id, 'cancelar', x.hO1, { versao: 0, motivo: 'Tarde demais.' })).statusCode).toBe(403)
    })
  })

  describe('seguir', () => {
    const seguir = (id: number, headers: Record<string, string>, metodo: 'PUT' | 'DELETE') =>
      app.inject({ method: metodo, url: `/api/v1/chamados/${id}/seguir`, headers })

    it('PUT cria o seguidor MANUAL; DELETE silencia; PUT de novo limpa o silenciamento (204)', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      const chave = { chamadoId_usuarioId: { chamadoId: c.id, usuarioId: x.o1.id } }
      expect((await seguir(c.id, x.hO1, 'PUT')).statusCode).toBe(204)
      expect(await prisma.chamadoSeguidor.findUniqueOrThrow({ where: chave })).toMatchObject({
        motivo: 'MANUAL',
        silenciadoEm: null,
      })
      expect((await seguir(c.id, x.hO1, 'DELETE')).statusCode).toBe(204)
      expect((await prisma.chamadoSeguidor.findUniqueOrThrow({ where: chave })).silenciadoEm).not.toBeNull()
      expect((await seguir(c.id, x.hO1, 'PUT')).statusCode).toBe(204)
      expect((await prisma.chamadoSeguidor.findUniqueOrThrow({ where: chave })).silenciadoEm).toBeNull()
    })

    it('fora do escopo é 404 e sem sessão é 401', async () => {
      const x = await cenario()
      const c = await x.novo('INICIAL')
      const estranho = await criarUsuario({ perfil: 'USUARIO' })
      expect((await seguir(c.id, await headersDe(estranho.id), 'PUT')).statusCode).toBe(404)
      expect((await seguir(c.id, { origin: ORIGEM }, 'PUT')).statusCode).toBe(401)
    })
  })
})
