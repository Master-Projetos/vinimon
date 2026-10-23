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

describe('leituras: "Visto por" (S98, TM4)', () => {
  let app: App
  let publicador: ReturnType<typeof espiao>
  const original: PublicadorTempoReal = tempoReal

  // app novo por teste: o contador do rate limit vive na instância e os ids de usuário se repetem
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

  const ler = (id: number, headers: Record<string, string>, assentamentoId: number) =>
    app.inject({ method: 'POST', url: `/api/v1/chamados/${id}/leitura`, headers, payload: { assentamentoId } })
  const listar = (id: number, headers: Record<string, string>) =>
    app.inject({ method: 'GET', url: `/api/v1/chamados/${id}/leituras`, headers })

  async function cenario() {
    const A = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const outro = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const c = await criarChamado({ solicitanteId: sol.id, areaId: A.id, papel: 'EM_ATENDIMENTO', operadorId: op.id })
    const a = (interno: boolean, texto: string) =>
      prisma.assentamento.create({
        data: { chamadoId: c.id, autorId: op.id, tipo: 'COMENTARIO', interno, texto },
        select: { id: true },
      })
    const pub1 = await a(false, 'público 1')
    const int1 = await a(true, 'interno 1')
    const pub2 = await a(false, 'público 2')
    return {
      A,
      sol,
      outro,
      op,
      c,
      pub1,
      int1,
      pub2,
      hSol: await headersDe(sol.id),
      hOp: await headersDe(op.id),
      hOutro: await headersDe(outro.id),
    }
  }
  const ponteiro = (chamadoId: number, usuarioId: number) =>
    prisma.chamadoLeitura.findUnique({ where: { chamadoId_usuarioId: { chamadoId, usuarioId } } })

  it('401 sem sessão, 400 sem corpo válido e 404 fora do escopo', async () => {
    const x = await cenario()
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/chamados/${x.c.id}/leitura`,
          headers: { origin: ORIGEM },
          payload: { assentamentoId: 1 },
        })
      ).statusCode,
    ).toBe(401)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/chamados/${x.c.id}/leitura`,
          headers: x.hSol,
          payload: { assentamentoId: 'a' },
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/chamados/${x.c.id}/leitura`,
          headers: x.hSol,
          payload: { assentamentoId: 1, extra: 1 },
        })
      ).statusCode,
    ).toBe(400)
    expect((await ler(x.c.id, x.hOutro, x.pub1.id)).statusCode).toBe(404)
    expect((await listar(x.c.id, x.hOutro)).statusCode).toBe(404)
  })

  it('o ponteiro avança e nunca regride', async () => {
    const x = await cenario()
    expect((await ler(x.c.id, x.hSol, x.pub2.id)).json()).toEqual({ ultimoAssentamentoLidoId: x.pub2.id })
    expect((await ponteiro(x.c.id, x.sol.id))?.ultimoAssentamentoLidoId).toBe(x.pub2.id)
    const volta = await ler(x.c.id, x.hSol, x.pub1.id)
    expect(volta.statusCode).toBe(200)
    expect(volta.json()).toEqual({ ultimoAssentamentoLidoId: x.pub2.id })
    expect((await ponteiro(x.c.id, x.sol.id))?.ultimoAssentamentoLidoId).toBe(x.pub2.id)
    expect(publicador.emitirLeitura).toHaveBeenCalledTimes(1)
  })

  it('o solicitante apontando para um interno dá 422; a equipe pode; assentamento de outro chamado dá 422', async () => {
    const x = await cenario()
    const res = await ler(x.c.id, x.hSol, x.int1.id)
    expect(res.statusCode).toBe(422)
    expect(res.json().erro.codigo).toBe('REGRA_NEGOCIO')
    expect(await ponteiro(x.c.id, x.sol.id)).toBeNull()
    expect((await ler(x.c.id, x.hOp, x.int1.id)).statusCode).toBe(200)
    const outroChamado = await criarChamado({ solicitanteId: x.sol.id, areaId: x.A.id, papel: 'INICIAL' })
    const alheio = await prisma.assentamento.create({
      data: { chamadoId: outroChamado.id, autorId: x.op.id, tipo: 'COMENTARIO', texto: 'x' },
      select: { id: true },
    })
    expect((await ler(x.c.id, x.hOp, alheio.id)).statusCode).toBe(422)
    expect((await ler(x.c.id, x.hOp, 999999)).statusCode).toBe(422)
  })

  it('marca como lidas as notificações do chamado, menos AVALIACAO_PENDENTE, e emite leitura e contagem', async () => {
    const x = await cenario()
    const nova = (tipo: 'COMENTARIO' | 'STATUS' | 'AVALIACAO_PENDENTE', chave: string, chamadoId = x.c.id) =>
      prisma.notificacao.create({ data: { usuarioId: x.sol.id, chamadoId, tipo, grupoChave: chave } })
    const n1 = await nova('COMENTARIO', 'comentario:1')
    const n2 = await nova('STATUS', 'status:1')
    const pendente = await nova('AVALIACAO_PENDENTE', 'avaliacao:1')
    const outroChamado = await criarChamado({ solicitanteId: x.sol.id, areaId: x.A.id, papel: 'INICIAL' })
    const doOutro = await nova('COMENTARIO', 'comentario:2', outroChamado.id)

    expect((await ler(x.c.id, x.hSol, x.pub2.id)).statusCode).toBe(200)
    const lida = async (id: number) => (await prisma.notificacao.findUniqueOrThrow({ where: { id } })).lidaEm
    expect(await lida(n1.id)).not.toBeNull()
    expect(await lida(n2.id)).not.toBeNull()
    expect(await lida(pendente.id)).toBeNull()
    expect(await lida(doOutro.id)).toBeNull()
    expect((await prisma.notificacao.findUniqueOrThrow({ where: { id: n1.id } })).grupoChave).toBe(
      `comentario:1#${n1.id}`,
    )
    expect(publicador.emitirLeitura).toHaveBeenCalledWith(x.c.id, x.sol.id, x.pub2.id, expect.any(Date))
    expect(publicador.emitirContagem).toHaveBeenCalledWith(x.sol.id, 2) // sobram a pendente e a do outro chamado
  })

  it('GET: a equipe vê o valor real; o solicitante recebe o maior id público ≤ ponteiro; só participantes', async () => {
    const x = await cenario()
    await ler(x.c.id, x.hOp, x.pub2.id) // operador leu até o fim
    await ler(x.c.id, x.hSol, x.pub1.id)
    await prisma.chamadoLeitura.create({
      data: { chamadoId: x.c.id, usuarioId: x.outro.id, ultimoAssentamentoLidoId: x.pub2.id },
    }) // não participante

    const daEquipe = (await listar(x.c.id, x.hOp)).json() as Array<{
      usuario: { id: number }
      ultimoAssentamentoId: number
    }>
    expect(daEquipe.map((l) => l.usuario.id).sort()).toEqual([x.sol.id, x.op.id].sort())
    expect(daEquipe.find((l) => l.usuario.id === x.op.id)?.ultimoAssentamentoId).toBe(x.pub2.id)

    // ponteiro da equipe parado no interno: o solicitante enxerga o último público anterior
    await prisma.chamadoLeitura.update({
      where: { chamadoId_usuarioId: { chamadoId: x.c.id, usuarioId: x.op.id } },
      data: { ultimoAssentamentoLidoId: x.int1.id },
    })
    const doSolicitante = (await listar(x.c.id, x.hSol)).json() as Array<{
      usuario: { id: number }
      ultimoAssentamentoId: number
    }>
    expect(doSolicitante.find((l) => l.usuario.id === x.op.id)?.ultimoAssentamentoId).toBe(x.pub1.id)
    expect(doSolicitante.find((l) => l.usuario.id === x.sol.id)?.ultimoAssentamentoId).toBe(x.pub1.id)
    expect(doSolicitante.some((l) => l.usuario.id === x.outro.id)).toBe(false)
  })

  it('GET: quem lê só até antes de qualquer assentamento público não aparece para o solicitante', async () => {
    const x = await cenario()
    const primeiroInterno = await prisma.assentamento.create({
      data: { chamadoId: x.c.id, autorId: x.op.id, tipo: 'COMENTARIO', interno: true, texto: 'antes de tudo' },
      select: { id: true },
    })
    await prisma.chamadoLeitura.create({
      data: { chamadoId: x.c.id, usuarioId: x.op.id, ultimoAssentamentoLidoId: primeiroInterno.id },
    })
    // não há público com id ≤ ao ponteiro? o `pub1` tem id menor: força um ponteiro abaixo de todos
    await prisma.chamadoLeitura.update({
      where: { chamadoId_usuarioId: { chamadoId: x.c.id, usuarioId: x.op.id } },
      data: { ultimoAssentamentoLidoId: x.pub1.id - 1 },
    })
    const lista = (await listar(x.c.id, x.hSol)).json() as unknown[]
    expect(lista).toEqual([])
  })
})
