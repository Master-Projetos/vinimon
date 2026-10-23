import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import { criarChamado, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
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

describe('assentamentos: timeline e comentar (S49, S99, S100, S101, T35)', () => {
  let app: App
  let publicador: ReturnType<typeof espiao>
  const original: PublicadorTempoReal = tempoReal

  // app novo por teste: o contador do rate limit vive na instância e os ids de usuário se repetem entre testes
  beforeEach(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
    await limparBanco()
    await semearBase()
    publicador = espiao()
    definirTempoReal(publicador)
  })
  afterEach(async () => {
    definirTempoReal(original)
    await app.close()
  })

  const url = (id: number) => `/api/v1/chamados/${id}/assentamentos`
  const comentar = (id: number, headers: Record<string, string>, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: url(id), headers, payload })
  const corpo = (texto: string, interno = false) => ({ texto, interno, clienteId: randomUUID() })

  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const outro = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const op2 = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const opB = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const novo = (papel: Parameters<typeof criarChamado>[0]['papel'], operadorId?: number, solicitanteId = sol.id) =>
      criarChamado({ solicitanteId, areaId: A.id, ...(papel ? { papel } : {}), ...(operadorId ? { operadorId } : {}) })
    return {
      A,
      B,
      sol,
      outro,
      op,
      op2,
      opB,
      novo,
      hSol: await headersDe(sol.id),
      hOutro: await headersDe(outro.id),
      hOp: await headersDe(op.id),
      hOpB: await headersDe(opB.id),
    }
  }
  const estado = (id: number) => prisma.chamado.findUniqueOrThrow({ where: { id } })

  describe('comentar', () => {
    it('401 sem sessão, 400 com corpo inválido e 404 fora do escopo', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.op.id)
      expect(
        (await app.inject({ method: 'POST', url: url(c.id), headers: { origin: ORIGEM }, payload: corpo('oi') }))
          .statusCode,
      ).toBe(401)
      const invalido = await comentar(c.id, x.hOp, { texto: '', interno: false, clienteId: 'x' })
      expect(invalido.statusCode).toBe(400)
      expect(invalido.json().erro.detalhes).toBeDefined()
      expect((await comentar(c.id, x.hOp, { ...corpo('oi'), extra: 1 })).statusCode).toBe(400)
      expect((await comentar(c.id, x.hOutro, corpo('oi'))).statusCode).toBe(404)
      expect((await comentar(c.id, x.hOpB, corpo('oi'))).statusCode).toBe(404)
    })

    it('operador comenta em público: 201, marca a 1ª resposta, segue como COMENTOU e atualiza os últimos', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.op.id)
      const res = await comentar(c.id, x.hOp, corpo('Estou verificando.'))
      expect(res.statusCode).toBe(201)
      const a = res.json().assentamento
      expect(a).toMatchObject({
        chamadoId: c.id,
        tipo: 'COMENTARIO',
        interno: false,
        texto: 'Estou verificando.',
        autor: { id: x.op.id },
      })
      expect(res.json().mencoesIgnoradas).toEqual([])
      const e = await estado(c.id)
      expect(e).toMatchObject({
        ultimoAssentamentoId: a.id,
        ultimoAssentamentoPublicoId: a.id,
        ultimaInteracaoAutorId: x.op.id,
      })
      expect(e.primeiraRespostaEm).not.toBeNull()
      expect(
        await prisma.chamadoSeguidor.findUniqueOrThrow({
          where: { chamadoId_usuarioId: { chamadoId: c.id, usuarioId: x.op.id } },
        }),
      ).toMatchObject({ motivo: 'COMENTOU', silenciadoEm: null })
      expect(await prisma.chamadoEvento.count({ where: { chamadoId: c.id, tipo: 'COMENTARIO', interno: false } })).toBe(
        1,
      )
      expect(publicador.emitirAssentamentos).toHaveBeenCalledWith(c.id, [a.id])
      expect(publicador.emitirChamadoAtualizado).not.toHaveBeenCalled()
      expect(publicador.emitirFila).not.toHaveBeenCalled()
    })

    it('o mesmo clienteId duas vezes gera um registro (201 e depois 200)', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.op.id)
      const payload = corpo('Mensagem única.')
      const primeiro = await comentar(c.id, x.hOp, payload)
      const segundo = await comentar(c.id, x.hOp, payload)
      expect(primeiro.statusCode).toBe(201)
      expect(segundo.statusCode).toBe(200)
      expect(segundo.json().assentamento.id).toBe(primeiro.json().assentamento.id)
      expect(await prisma.assentamento.count({ where: { chamadoId: c.id } })).toBe(1)
      expect(await prisma.chamadoEvento.count({ where: { chamadoId: c.id, tipo: 'COMENTARIO' } })).toBe(1)
    })

    it('duas requisições simultâneas com o mesmo clienteId: um registro só, nenhuma falha', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.op.id)
      const payload = corpo('Corrida.')
      const [a, b] = await Promise.all([comentar(c.id, x.hOp, payload), comentar(c.id, x.hOp, payload)])
      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201])
      expect(await prisma.assentamento.count({ where: { chamadoId: c.id } })).toBe(1)
    })

    it('comentário do solicitante tira o chamado de AGUARDANDO_SOLICITANTE e não conta como 1ª resposta', async () => {
      const x = await cenario()
      const c = await x.novo('AGUARDANDO_SOLICITANTE', x.op.id)
      const res = await comentar(c.id, x.hSol, corpo('Segue a informação pedida.'))
      expect(res.statusCode).toBe(201)
      const e = await estado(c.id)
      expect(e.statusTipo).toBe('EM_ATENDIMENTO')
      expect(e.operadorId).toBe(x.op.id)
      expect(e.primeiraRespostaEm).toBeNull()
      expect(publicador.emitirChamadoAtualizado).toHaveBeenCalledWith(c.id, ['status'], false)
    })

    it('comentário interno: só a equipe; não muda ultimaAtividadeEm, nem avisa fora da sala interna, nem conta 1ª resposta', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.op.id)
      const antes = await estado(c.id)
      expect((await comentar(c.id, x.hSol, corpo('Quero ver o interno.', true))).statusCode).toBe(403)

      const res = await comentar(c.id, x.hOp, corpo('Nota interna.', true))
      expect(res.statusCode).toBe(201)
      expect(res.json().assentamento.interno).toBe(true)
      const depois = await estado(c.id)
      expect(depois.ultimaAtividadeEm.getTime()).toBe(antes.ultimaAtividadeEm.getTime())
      expect(depois.ultimoAssentamentoId).toBe(res.json().assentamento.id)
      expect(depois.ultimoAssentamentoPublicoId).toBe(antes.ultimoAssentamentoPublicoId)
      expect(depois.primeiraRespostaEm).toBeNull()
      expect(await prisma.chamadoEvento.count({ where: { chamadoId: c.id, tipo: 'COMENTARIO', interno: true } })).toBe(
        1,
      )
      expect(publicador.emitirChamadoAtualizado).not.toHaveBeenCalled()
      expect(publicador.emitirFila).not.toHaveBeenCalled()
    })

    it('403 quando o chamado já foi encerrado (equipe) ou concluído (solicitante)', async () => {
      const x = await cenario()
      const encerrado = await x.novo('ENCERRADO', x.op.id)
      expect((await comentar(encerrado.id, x.hOp, corpo('Tarde demais.'))).statusCode).toBe(403)
      const concluido = await x.novo('CONCLUIDO', x.op.id)
      expect((await comentar(concluido.id, x.hSol, corpo('Posso comentar?'))).statusCode).toBe(403)
      expect((await comentar(concluido.id, x.hOp, corpo('A equipe pode.'))).statusCode).toBe(201)
    })

    it('menções válidas viram Mencao e seguidor MENCIONADO; inválidas voltam em mencoesIgnoradas (S100)', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.op.id)
      const inativo = await criarUsuario({ perfil: 'OPERADOR', areaId: x.A.id, ativo: false })
      const texto = `Oi @[Colega](usuario:${x.op2.id}), @[Outra](usuario:${x.opB.id}), @[Fora](usuario:${inativo.id}) e @[Eu](usuario:${x.op.id})`
      const res = await comentar(c.id, x.hOp, corpo(texto))
      expect(res.statusCode).toBe(201)
      expect(
        res
          .json()
          .mencoesIgnoradas.map((m: { id: number }) => m.id)
          .sort(),
      ).toEqual([x.opB.id, inativo.id].sort())
      const mencoes = await prisma.mencao.findMany({ where: { chamadoId: c.id } })
      expect(mencoes.map((m) => m.usuarioId)).toEqual([x.op2.id])
      expect(
        await prisma.chamadoSeguidor.findUniqueOrThrow({
          where: { chamadoId_usuarioId: { chamadoId: c.id, usuarioId: x.op2.id } },
        }),
      ).toMatchObject({ motivo: 'MENCIONADO' })
      const ev = await prisma.chamadoEvento.findFirstOrThrow({ where: { chamadoId: c.id, tipo: 'COMENTARIO' } })
      expect(ev.dados).toMatchObject({ mencionados: [x.op2.id] })
    })

    it('em comentário interno, o solicitante mencionado é ignorado; 21 menções dão 400', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.op.id)
      const res = await comentar(c.id, x.hOp, corpo(`Veja @[Sol](usuario:${x.sol.id})`, true))
      expect(res.statusCode).toBe(201)
      expect(res.json().mencoesIgnoradas.map((m: { id: number }) => m.id)).toEqual([x.sol.id])
      const muitas = Array.from({ length: 21 }, (_, i) => `@[U${i}](usuario:${1000 + i})`).join(' ')
      const excesso = await comentar(c.id, x.hOp, corpo(muitas))
      expect(excesso.statusCode).toBe(400)
      expect(excesso.json().erro.detalhes).toBeDefined()
    })

    it('limita a 30 comentários por minuto', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.op.id)
      const codigos: number[] = []
      for (let i = 0; i < 31; i++) codigos.push((await comentar(c.id, x.hOp, corpo(`m${i}`))).statusCode)
      expect(codigos.slice(0, 30).every((s) => s === 201)).toBe(true)
      expect(codigos[30]).toBe(429)
    })
  })

  describe('listar', () => {
    it('T35: o solicitante (inclusive OPERADOR) não vê o interno; a equipe vê tudo, em ordem crescente', async () => {
      const x = await cenario()
      const opSol = await criarUsuario({ perfil: 'OPERADOR', areaId: x.B.id })
      const c = await x.novo('EM_ATENDIMENTO', x.op.id, opSol.id)
      const hOpSol = await headersDe(opSol.id)
      await comentar(c.id, x.hOp, corpo('público 1'))
      await comentar(c.id, x.hOp, corpo('interno 1', true))
      await comentar(c.id, hOpSol, corpo('público 2'))

      const doSolicitante = await app.inject({ method: 'GET', url: url(c.id), headers: hOpSol })
      expect(doSolicitante.statusCode).toBe(200)
      expect(doSolicitante.json().itens.map((a: { texto: string }) => a.texto)).toEqual(['público 1', 'público 2'])

      const daEquipe = await app.inject({ method: 'GET', url: url(c.id), headers: x.hOp })
      const textos = daEquipe.json().itens.map((a: { texto: string }) => a.texto)
      expect(textos).toEqual(['público 1', 'interno 1', 'público 2'])
      const ids = daEquipe.json().itens.map((a: { id: number }) => a.id)
      expect(ids).toEqual([...ids].sort((a, b) => a - b))
      expect(daEquipe.json().proximoCursor).toBeNull()
    })

    it('pagina por cursor (antesDe) e devolve cada página em ordem crescente', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.op.id)
      for (let i = 1; i <= 5; i++) await comentar(c.id, x.hOp, corpo(`msg ${i}`))
      const p1 = (await app.inject({ method: 'GET', url: `${url(c.id)}?limite=2`, headers: x.hOp })).json()
      expect(p1.itens.map((a: { texto: string }) => a.texto)).toEqual(['msg 4', 'msg 5'])
      expect(p1.proximoCursor).toBe(p1.itens[0].id)
      const p2 = (
        await app.inject({ method: 'GET', url: `${url(c.id)}?limite=2&antesDe=${p1.proximoCursor}`, headers: x.hOp })
      ).json()
      expect(p2.itens.map((a: { texto: string }) => a.texto)).toEqual(['msg 2', 'msg 3'])
      const p3 = (
        await app.inject({ method: 'GET', url: `${url(c.id)}?limite=2&antesDe=${p2.proximoCursor}`, headers: x.hOp })
      ).json()
      expect(p3.itens.map((a: { texto: string }) => a.texto)).toEqual(['msg 1'])
      expect(p3.proximoCursor).toBeNull()
    })

    it('404 fora do escopo, 401 sem sessão e 400 com limite inválido', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.op.id)
      expect((await app.inject({ method: 'GET', url: url(c.id), headers: x.hOutro })).statusCode).toBe(404)
      expect((await app.inject({ method: 'GET', url: url(c.id), headers: x.hOpB })).statusCode).toBe(404)
      expect((await app.inject({ method: 'GET', url: url(c.id) })).statusCode).toBe(401)
      expect((await app.inject({ method: 'GET', url: `${url(c.id)}?limite=1000`, headers: x.hOp })).statusCode).toBe(
        400,
      )
    })
  })
})
