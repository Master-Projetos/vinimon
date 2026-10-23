import type { Socket } from 'socket.io-client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../test/ajudantes'
import { criarChamado, semearBase } from '../../test/fabricas'
import { conectar, esperarConectar, esperarEvento, naoRecebe } from '../../test/socket'
import { type App, buildApp } from '../app'
import { prisma } from '../lib/prisma'
import { tempoReal } from '../lib/tempo-real'

describe('handlers do Socket.IO: salas, digitação e emissões (S92, S93, S95, S96, S98, T53, T54, T57)', () => {
  let app: App
  const abertos: Socket[] = []

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
  afterEach(() => {
    for (const s of abertos.splice(0)) s.disconnect()
  })

  const ligar = async (usuarioId: number) => {
    const s = await conectar(app, (await headersDe(usuarioId)).cookie)
    abertos.push(s)
    await esperarConectar(s)
    return s
  }
  const entrar = (s: Socket, chamadoId: number) =>
    new Promise<{ ok: boolean; erro?: string }>((resolver) => {
      s.emit('chamado:entrar', { chamadoId }, resolver)
    })

  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const solOp = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id }) // OPERADOR que abriu o chamado
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const opB = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const c = await criarChamado({ solicitanteId: sol.id, areaId: A.id, papel: 'EM_ATENDIMENTO', operadorId: op.id })
    const cOp = await criarChamado({
      solicitanteId: solOp.id,
      areaId: A.id,
      papel: 'EM_ATENDIMENTO',
      operadorId: op.id,
    })
    const assentamento = (chamadoId: number, interno: boolean, texto: string) =>
      prisma.assentamento.create({
        data: { chamadoId, autorId: op.id, tipo: 'COMENTARIO', interno, texto },
        select: { id: true },
      })
    return { A, B, sol, solOp, op, opB, admin, c, cOp, assentamento }
  }

  describe('chamado:entrar e chamado:sair', () => {
    it('T53: dentro do escopo entra; fora dele (ou inexistente) dá INDISPONIVEL e o comentário seguinte não chega', async () => {
      const x = await cenario()
      const dentro = await ligar(x.sol.id)
      const fora = await ligar(x.opB.id)
      expect(await entrar(dentro, x.c.id)).toEqual({ ok: true })
      expect(await entrar(fora, x.c.id)).toEqual({ ok: false, erro: 'INDISPONIVEL' })
      expect(await entrar(fora, 999_999)).toEqual({ ok: false, erro: 'INDISPONIVEL' })

      const a = await x.assentamento(x.c.id, false, 'público')
      const chegou = esperarEvento<{ chamadoId: number; assentamento: { id: number } }>(dentro, 'assentamento:novo')
      const naoChegou = naoRecebe(fora, 'assentamento:novo')
      tempoReal.emitirAssentamentos(x.c.id, [a.id])
      expect((await chegou).assentamento.id).toBe(a.id)
      await naoChegou
    })

    it('INVALIDO para payload ruim, com ack ausente tratado; chave extra também é inválida', async () => {
      const x = await cenario()
      const s = await ligar(x.sol.id)
      const resposta = (payload: unknown) =>
        new Promise((resolver) => {
          s.emit('chamado:entrar', payload, resolver)
        })
      expect(await resposta({ chamadoId: 'x' })).toEqual({ ok: false, erro: 'INVALIDO' })
      expect(await resposta({ chamadoId: x.c.id, extra: 1 })).toEqual({ ok: false, erro: 'INVALIDO' })
      s.emit('chamado:entrar', { chamadoId: 1 }) // sem ack: não derruba o servidor
      s.emit('chamado:entrar', 'lixo')
      expect(await entrar(s, x.c.id)).toEqual({ ok: true })
    })

    it('limita a 20 salas de chamado; sair libera vaga', async () => {
      const x = await cenario()
      const s = await ligar(x.admin.id)
      const ids: number[] = []
      for (let i = 0; i < 21; i++)
        ids.push((await criarChamado({ solicitanteId: x.sol.id, areaId: x.A.id, papel: 'INICIAL' })).id)
      for (const id of ids.slice(0, 20)) expect((await entrar(s, id)).ok).toBe(true)
      expect(await entrar(s, ids[20] ?? 0)).toEqual({ ok: false, erro: 'LIMITE_SALAS' })
      s.emit('chamado:sair', { chamadoId: ids[0] })
      await new Promise((r) => setTimeout(r, 100))
      expect(await entrar(s, ids[20] ?? 0)).toEqual({ ok: true })
    })

    it('limita chamado:entrar a 30 por minuto (RATE_LIMIT)', async () => {
      const x = await cenario()
      const s = await ligar(x.sol.id)
      const resultados: Array<{ ok: boolean; erro?: string }> = []
      for (let i = 0; i < 31; i++) resultados.push(await entrar(s, x.c.id))
      expect(resultados.slice(0, 30).every((r) => r.ok)).toBe(true)
      expect(resultados[30]).toEqual({ ok: false, erro: 'RATE_LIMIT' })
    })
  })

  describe('T54: o interno nunca chega ao solicitante, nem quando ele é OPERADOR', () => {
    it('assentamento interno só na sala interna; o público chega a todos', async () => {
      const x = await cenario()
      const sol = await ligar(x.solOp.id)
      const equipe = await ligar(x.op.id)
      await entrar(sol, x.cOp.id)
      await entrar(equipe, x.cOp.id)
      const interno = await x.assentamento(x.cOp.id, true, 'só equipe')
      const publico = await x.assentamento(x.cOp.id, false, 'para todos')

      const deveReceber = esperarEvento<{ assentamento: { id: number } }>(equipe, 'assentamento:novo')
      const naoDeve = naoRecebe(sol, 'assentamento:novo')
      tempoReal.emitirAssentamentos(x.cOp.id, [interno.id])
      expect((await deveReceber).assentamento.id).toBe(interno.id)
      await naoDeve

      const dosDois = [esperarEvento(sol, 'assentamento:novo'), esperarEvento(equipe, 'assentamento:novo')]
      tempoReal.emitirAssentamentos(x.cOp.id, [publico.id])
      await Promise.all(dosDois)
    })

    it('chamado:atualizado interno e fila: o solicitante OPERADOR não recebe chamado:atualizado interno; fila não sai por interno', async () => {
      const x = await cenario()
      const sol = await ligar(x.solOp.id)
      const equipe = await ligar(x.op.id)
      await entrar(sol, x.cOp.id)
      await entrar(equipe, x.cOp.id)
      const equipeRecebe = esperarEvento(equipe, 'chamado:atualizado')
      const solNao = naoRecebe(sol, 'chamado:atualizado')
      tempoReal.emitirChamadoAtualizado(x.cOp.id, ['tags'], true)
      await equipeRecebe
      await solNao
      const aoTodos = [esperarEvento(sol, 'chamado:atualizado'), esperarEvento(equipe, 'chamado:atualizado')]
      tempoReal.emitirChamadoAtualizado(x.cOp.id, ['status'], false)
      await Promise.all(aoTodos)
    })

    it('digitando interno: só a sala interna; o solicitante OPERADOR não vê, a equipe vê', async () => {
      const x = await cenario()
      const sol = await ligar(x.solOp.id)
      const equipe = await ligar(x.op.id)
      const outro = await ligar(x.admin.id)
      for (const s of [sol, equipe, outro]) await entrar(s, x.cOp.id)
      const equipeVe = esperarEvento<{ digitando: boolean; interno: boolean; usuario: { id: number } }>(
        equipe,
        'chamado:digitando',
      )
      const solNaoVe = naoRecebe(sol, 'chamado:digitando')
      outro.emit('chamado:digitando', { chamadoId: x.cOp.id, interno: true, digitando: true })
      expect(await equipeVe).toMatchObject({ digitando: true, interno: true, usuario: { id: x.admin.id } })
      await solNaoVe
    })

    it('leitura: a sala interna recebe o valor real; o solicitante, o maior id público ≤ valor (S98)', async () => {
      const x = await cenario()
      const sol = await ligar(x.solOp.id)
      const equipe = await ligar(x.op.id)
      await entrar(sol, x.cOp.id)
      await entrar(equipe, x.cOp.id)
      const pub = await x.assentamento(x.cOp.id, false, 'p1')
      const inter = await x.assentamento(x.cOp.id, true, 'i1')
      const real = esperarEvento<{ ultimoAssentamentoId: number }>(equipe, 'chamado:leitura')
      const limitado = esperarEvento<{ ultimoAssentamentoId: number }>(sol, 'chamado:leitura')
      tempoReal.emitirLeitura(x.cOp.id, x.admin.id, inter.id, new Date())
      expect((await real).ultimoAssentamentoId).toBe(inter.id)
      expect((await limitado).ultimoAssentamentoId).toBe(pub.id)
    })

    it('leitura apontando abaixo de qualquer público: o solicitante não recebe nada', async () => {
      const x = await cenario()
      const sol = await ligar(x.solOp.id)
      await entrar(sol, x.cOp.id)
      const inter = await x.assentamento(x.cOp.id, true, 'primeiro é interno')
      const nao = naoRecebe(sol, 'chamado:leitura')
      tempoReal.emitirLeitura(x.cOp.id, x.admin.id, inter.id, new Date())
      await nao
    })
  })

  describe('digitando', () => {
    it('exige a sala: sem ter entrado, ninguém recebe', async () => {
      const x = await cenario()
      const a = await ligar(x.sol.id)
      const b = await ligar(x.op.id)
      await entrar(b, x.c.id)
      const nao = naoRecebe(b, 'chamado:digitando')
      a.emit('chamado:digitando', { chamadoId: x.c.id, interno: false, digitando: true })
      await nao
    })

    it('T57: a 2ª digitando=true em 2 s é descartada em silêncio; digitando=false sai', async () => {
      const x = await cenario()
      const a = await ligar(x.sol.id)
      const b = await ligar(x.op.id)
      await entrar(a, x.c.id)
      await entrar(b, x.c.id)
      const recebidos: boolean[] = []
      b.on('chamado:digitando', (p: { digitando: boolean }) => recebidos.push(p.digitando))
      // pausas curtas: o evento é `volatile` e pode ser descartado se o transporte estiver ocupado
      const pausa = () => new Promise((r) => setTimeout(r, 80))
      a.emit('chamado:digitando', { chamadoId: x.c.id, interno: false, digitando: true })
      await pausa()
      a.emit('chamado:digitando', { chamadoId: x.c.id, interno: false, digitando: true })
      await pausa()
      a.emit('chamado:digitando', { chamadoId: x.c.id, interno: false, digitando: false })
      await new Promise((r) => setTimeout(r, 300))
      expect(recebidos).toEqual([true, false])
    })

    it('ao desconectar, quem estava digitando "para de digitar" para os demais', async () => {
      const x = await cenario()
      const a = await ligar(x.sol.id)
      const b = await ligar(x.op.id)
      await entrar(a, x.c.id)
      await entrar(b, x.c.id)
      const primeiro = esperarEvento(b, 'chamado:digitando')
      a.emit('chamado:digitando', { chamadoId: x.c.id, interno: false, digitando: true })
      await primeiro
      const fim = esperarEvento<{ digitando: boolean }>(b, 'chamado:digitando')
      a.disconnect()
      expect((await fim).digitando).toBe(false)
    })
  })

  describe('limites do socket (T57)', () => {
    it('payload de 20 KB derruba a conexão', async () => {
      const x = await cenario()
      const s = await ligar(x.sol.id)
      const caiu = new Promise<void>((resolver) => {
        s.once('disconnect', () => resolver())
      })
      s.emit('chamado:digitando', { chamadoId: x.c.id, interno: false, digitando: true, lixo: 'x'.repeat(20_000) })
      await caiu
      expect(s.connected).toBe(false)
    })

    it('20 violações em 60 s derrubam o socket', async () => {
      const x = await cenario()
      const s = await ligar(x.sol.id)
      const caiu = new Promise<void>((resolver) => {
        s.once('disconnect', () => resolver())
      })
      for (let i = 0; i < 25; i++) s.emit('chamado:entrar', { chamadoId: 'invalido' }, () => undefined)
      await caiu
      expect(s.connected).toBe(false)
    })

    it('eventos desconhecidos são ignorados', async () => {
      const x = await cenario()
      const s = await ligar(x.sol.id)
      s.emit('evento:inexistente', { a: 1 })
      expect(await entrar(s, x.c.id)).toEqual({ ok: true })
    })
  })

  describe('fila, notificações e contagem', () => {
    it('fila:atualizada vai para a área, admins, solicitante e operador; não para outra área', async () => {
      const x = await cenario()
      const daArea = await ligar(x.op.id)
      const admin = await ligar(x.admin.id)
      const solicitante = await ligar(x.sol.id)
      const outraArea = await ligar(x.opB.id)
      const recebem = [daArea, admin, solicitante].map((s) => esperarEvento<{ motivo: string }>(s, 'fila:atualizada'))
      const nao = naoRecebe(outraArea, 'fila:atualizada')
      tempoReal.emitirFila(x.c.id, 'status')
      expect((await Promise.all(recebem)).every((r) => r.motivo === 'status')).toBe(true)
      await nao
    })

    it('notificacao:nova só para o dono, sem texto de usuário, com a contagem; contagem avulsa também', async () => {
      const x = await cenario()
      const dono = await ligar(x.sol.id)
      const outro = await ligar(x.op.id)
      const a = await x.assentamento(x.c.id, false, 'corpo da mensagem que não pode ir')
      const n = await prisma.notificacao.create({
        data: {
          usuarioId: x.sol.id,
          chamadoId: x.c.id,
          tipo: 'COMENTARIO',
          grupoChave: 'comentario:1',
          assentamentoId: a.id,
          atorIds: [x.op.id],
        },
      })
      const recebe = esperarEvento<{ notificacao: Record<string, unknown>; naoLidas: number }>(dono, 'notificacao:nova')
      const nao = naoRecebe(outro, 'notificacao:nova')
      tempoReal.emitirNotificacoes([{ usuarioId: x.sol.id, notificacaoId: n.id }])
      const msg = await recebe
      expect(msg.naoLidas).toBe(1)
      expect(msg.notificacao).toMatchObject({ id: n.id, tipo: 'COMENTARIO', trecho: null, atores: [{ id: x.op.id }] })
      expect(JSON.stringify(msg)).not.toContain('corpo da mensagem')
      await nao

      const contagem = esperarEvento<{ naoLidas: number }>(dono, 'notificacao:contagem')
      tempoReal.emitirContagem(x.sol.id, 7)
      expect(await contagem).toEqual({ naoLidas: 7 })
    })
  })
})
