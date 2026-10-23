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

describe('rotas de notificações e preferências (S102, S103, T60, T61)', () => {
  let app: App
  let publicador: ReturnType<typeof espiao>
  const original: PublicadorTempoReal = tempoReal

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

  const get = (url: string, headers: Record<string, string>) =>
    app.inject({ method: 'GET', url: `/api/v1${url}`, headers })
  const post = (url: string, headers: Record<string, string>, payload?: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/v1${url}`, headers, ...(payload ? { payload } : {}) })

  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const sol = await criarUsuario({ perfil: 'USUARIO' })
    const op = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const opB = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const c = await criarChamado({ solicitanteId: sol.id, areaId: A.id, papel: 'EM_ATENDIMENTO', operadorId: op.id })
    const nova = (
      usuarioId: number,
      tipo: 'COMENTARIO' | 'MENCAO' | 'ATRIBUIDO' | 'SLA' | 'STATUS' | 'AVALIACAO_PENDENTE',
      chave: string,
      extra: {
        interno?: boolean
        chamadoId?: number
        assentamentoId?: number
        atorIds?: number[]
        atualizadoEm?: Date
      } = {},
    ) =>
      prisma.notificacao.create({
        data: {
          usuarioId,
          chamadoId: extra.chamadoId ?? c.id,
          tipo,
          grupoChave: chave,
          interno: extra.interno ?? false,
          ...(extra.assentamentoId ? { assentamentoId: extra.assentamentoId } : {}),
          ...(extra.atorIds ? { atorIds: extra.atorIds } : {}),
          ...(extra.atualizadoEm ? { atualizadoEm: extra.atualizadoEm } : {}),
        },
      })
    return {
      A,
      B,
      sol,
      op,
      opB,
      c,
      nova,
      hSol: await headersDe(sol.id),
      hOp: await headersDe(op.id),
      hOpB: await headersDe(opB.id),
    }
  }

  it('401 sem sessão em todas as rotas', async () => {
    for (const [metodo, url] of [
      ['GET', '/notificacoes'],
      ['GET', '/notificacoes/contagem'],
      ['POST', '/notificacoes/1/lida'],
      ['POST', '/notificacoes/1/nao-lida'],
      ['POST', '/notificacoes/lidas'],
      ['GET', '/me/preferencias-notificacao'],
      ['PUT', '/me/preferencias-notificacao'],
    ] as const) {
      const res = await app.inject({
        method: metodo,
        url: `/api/v1${url}`,
        headers: { origin: ORIGEM },
        ...(metodo !== 'GET' ? { payload: {} } : {}),
      })
      expect(res.statusCode, `${metodo} ${url}`).toBe(401)
    }
  })

  describe('feed', () => {
    it('lista do mais recente ao mais antigo, com chamado, atores, trecho e o texto sem corpo de usuário (S102)', async () => {
      const x = await cenario()
      const a = await prisma.assentamento.create({
        data: {
          chamadoId: x.c.id,
          autorId: x.op.id,
          tipo: 'COMENTARIO',
          texto: `Olá @[${x.sol.id}](usuario:${x.sol.id}) veja isto`.replace(`@[${x.sol.id}]`, '@[Fulano]'),
        },
        select: { id: true },
      })
      await x.nova(x.sol.id, 'COMENTARIO', 'comentario:1', {
        assentamentoId: a.id,
        atorIds: [x.op.id],
        atualizadoEm: new Date(Date.now() - 60_000),
      })
      await x.nova(x.sol.id, 'STATUS', 'status:1')
      const res = await get('/notificacoes', x.hSol)
      expect(res.statusCode).toBe(200)
      const { itens, proximoCursor } = res.json()
      expect(itens.map((i: { tipo: string }) => i.tipo)).toEqual(['STATUS', 'COMENTARIO'])
      expect(proximoCursor).toBeNull()
      expect(itens[1]).toMatchObject({
        chamado: { id: x.c.id },
        atores: [{ id: x.op.id, nome: expect.any(String) }],
        trecho: 'Olá @Fulano veja isto',
        lida: false,
        contagem: 1,
      })
    })

    it('filtros nao_lidas, mencoes, atribuicoes e sla', async () => {
      const x = await cenario()
      await x.nova(x.sol.id, 'MENCAO', 'mencao:1')
      await x.nova(x.sol.id, 'ATRIBUIDO', 'atribuido:1')
      await x.nova(x.sol.id, 'SLA', 'sla:1')
      const lida = await x.nova(x.sol.id, 'COMENTARIO', 'comentario:1')
      await prisma.notificacao.update({ where: { id: lida.id }, data: { lidaEm: new Date() } })
      const tipos = async (filtro: string) =>
        ((await get(`/notificacoes?filtro=${filtro}`, x.hSol)).json().itens as Array<{ tipo: string }>)
          .map((i) => i.tipo)
          .sort()
      expect(await tipos('todas')).toEqual(['ATRIBUIDO', 'COMENTARIO', 'MENCAO', 'SLA'])
      expect(await tipos('nao_lidas')).toEqual(['ATRIBUIDO', 'MENCAO', 'SLA'])
      expect(await tipos('mencoes')).toEqual(['MENCAO'])
      expect(await tipos('atribuicoes')).toEqual(['ATRIBUIDO'])
      expect(await tipos('sla')).toEqual(['SLA'])
      expect((await get('/notificacoes?filtro=outro', x.hSol)).statusCode).toBe(400)
    })

    it('pagina por cursor sem repetir nem pular itens', async () => {
      const x = await cenario()
      for (let i = 1; i <= 5; i++)
        await x.nova(x.sol.id, 'STATUS', `status:${i}`, { atualizadoEm: new Date(Date.now() - (6 - i) * 60_000) })
      const p1 = (await get('/notificacoes?limite=2', x.hSol)).json()
      expect(p1.itens).toHaveLength(2)
      expect(p1.proximoCursor).not.toBeNull()
      const p2 = (await get(`/notificacoes?limite=2&cursor=${p1.proximoCursor}`, x.hSol)).json()
      const p3 = (await get(`/notificacoes?limite=2&cursor=${p2.proximoCursor}`, x.hSol)).json()
      const ids = [...p1.itens, ...p2.itens, ...p3.itens].map((i: { id: number }) => i.id)
      expect(new Set(ids).size).toBe(5)
      expect(p3.proximoCursor).toBeNull()
      expect((await get('/notificacoes?cursor=lixo', x.hSol)).statusCode).toBe(400)
    })

    it('interno: o solicitante não vê a notificação interna nem o trecho; a equipe vê', async () => {
      const x = await cenario()
      const interno = await prisma.assentamento.create({
        data: { chamadoId: x.c.id, autorId: x.op.id, tipo: 'COMENTARIO', interno: true, texto: 'segredo da equipe' },
        select: { id: true },
      })
      await x.nova(x.sol.id, 'COMENTARIO', 'comentario:i', { interno: true, assentamentoId: interno.id })
      await x.nova(x.op.id, 'COMENTARIO', 'comentario:i', { interno: true, assentamentoId: interno.id })
      expect((await get('/notificacoes', x.hSol)).json().itens).toEqual([])
      expect((await get('/notificacoes/contagem', x.hSol)).json()).toEqual({ naoLidas: 0 })
      const daEquipe = (await get('/notificacoes', x.hOp)).json().itens
      expect(daEquipe).toHaveLength(1)
      expect(daEquipe[0].trecho).toBe('segredo da equipe')
    })

    it('T60: depois de encaminhar, quem perdeu o acesso não vê o item, nem o trecho, e a contagem não o inclui', async () => {
      const x = await cenario()
      const a = await prisma.assentamento.create({
        data: { chamadoId: x.c.id, autorId: x.sol.id, tipo: 'COMENTARIO', texto: 'texto do chamado' },
        select: { id: true },
      })
      await x.nova(x.op.id, 'COMENTARIO', 'comentario:1', { assentamentoId: a.id })
      expect((await get('/notificacoes', x.hOp)).json().itens).toHaveLength(1)
      expect((await get('/notificacoes/contagem', x.hOp)).json().naoLidas).toBe(1)
      // o chamado vai para a área B e o operador A deixa de ser o responsável
      await prisma.chamado.update({ where: { id: x.c.id }, data: { areaId: x.B.id, operadorId: null } })
      expect((await get('/notificacoes', x.hOp)).json().itens).toEqual([])
      expect((await get('/notificacoes/contagem', x.hOp)).json().naoLidas).toBe(0)
      // quem passou a ver não ganha nada retroativo; o item do solicitante segue visível
      await x.nova(x.sol.id, 'STATUS', 'status:1')
      expect((await get('/notificacoes/contagem', x.hSol)).json().naoLidas).toBe(1)
    })

    it('só lista as próprias notificações', async () => {
      const x = await cenario()
      await x.nova(x.sol.id, 'STATUS', 'status:1')
      expect((await get('/notificacoes', x.hOp)).json().itens).toEqual([])
    })
  })

  describe('marcar como lida', () => {
    it('lida fecha o grupo (chave#id), baixa a contagem e emite; não-lida reabre a leitura', async () => {
      const x = await cenario()
      const n = await x.nova(x.sol.id, 'STATUS', 'status:1')
      await x.nova(x.sol.id, 'COMENTARIO', 'comentario:1')
      const res = await post(`/notificacoes/${n.id}/lida`, x.hSol)
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ naoLidas: 1 })
      const depois = await prisma.notificacao.findUniqueOrThrow({ where: { id: n.id } })
      expect(depois.lidaEm).not.toBeNull()
      expect(depois.grupoChave).toBe(`status:1#${n.id}`)
      expect(publicador.emitirContagem).toHaveBeenLastCalledWith(x.sol.id, 1)

      const volta = await post(`/notificacoes/${n.id}/nao-lida`, x.hSol)
      expect(volta.json()).toEqual({ naoLidas: 2 })
      expect((await prisma.notificacao.findUniqueOrThrow({ where: { id: n.id } })).lidaEm).toBeNull()
    })

    it('AVALIACAO_PENDENTE dá 422; notificação alheia ou inexistente dá 404', async () => {
      const x = await cenario()
      const pendente = await x.nova(x.sol.id, 'AVALIACAO_PENDENTE', 'avaliacao:1')
      const res = await post(`/notificacoes/${pendente.id}/lida`, x.hSol)
      expect(res.statusCode).toBe(422)
      expect(res.json().erro.codigo).toBe('REGRA_NEGOCIO')
      expect((await post(`/notificacoes/${pendente.id}/lida`, x.hOp)).statusCode).toBe(404)
      expect((await post('/notificacoes/999999/lida', x.hSol)).statusCode).toBe(404)
      expect((await post('/notificacoes/999999/nao-lida', x.hSol)).statusCode).toBe(404)
    })

    it('lidas: todas (menos AVALIACAO_PENDENTE) ou só as de um chamado', async () => {
      const x = await cenario()
      const outro = await criarChamado({ solicitanteId: x.sol.id, areaId: x.A.id, papel: 'INICIAL' })
      await x.nova(x.sol.id, 'STATUS', 'status:1')
      await x.nova(x.sol.id, 'AVALIACAO_PENDENTE', 'avaliacao:1')
      await x.nova(x.sol.id, 'STATUS', 'status:2', { chamadoId: outro.id })
      expect((await post('/notificacoes/lidas', x.hSol, { chamadoId: x.c.id })).json()).toEqual({ naoLidas: 2 })
      expect((await post('/notificacoes/lidas', x.hSol, {})).json()).toEqual({ naoLidas: 1 })
      expect((await post('/notificacoes/lidas', x.hSol, { extra: 1 })).statusCode).toBe(400)
    })
  })

  describe('preferências', () => {
    it('GET devolve os 10 tipos com o padrão; fixos marcados', async () => {
      const x = await cenario()
      const { itens } = (await get('/me/preferencias-notificacao', x.hSol)).json()
      expect(itens).toHaveLength(10)
      expect(itens.find((i: { tipo: string }) => i.tipo === 'MENCAO')).toEqual({
        tipo: 'MENCAO',
        inApp: true,
        desktop: true,
        fixo: true,
      })
      expect(itens.find((i: { tipo: string }) => i.tipo === 'STATUS')).toEqual({
        tipo: 'STATUS',
        inApp: true,
        desktop: false,
        fixo: false,
      })
    })

    it('PUT guarda só as diferenças do padrão; desligar o in-app desliga o desktop; voltar ao padrão apaga', async () => {
      const x = await cenario()
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/me/preferencias-notificacao',
        headers: x.hSol,
        payload: {
          itens: [
            { tipo: 'COMENTARIO', inApp: false, desktop: true },
            { tipo: 'STATUS', inApp: true, desktop: false },
            { tipo: 'SLA', inApp: true, desktop: false },
          ],
        },
      })
      expect(res.statusCode).toBe(200)
      const itens = res.json().itens as Array<{ tipo: string; inApp: boolean; desktop: boolean }>
      expect(itens.find((i) => i.tipo === 'COMENTARIO')).toMatchObject({ inApp: false, desktop: false })
      const gravadas = await prisma.preferenciaNotificacao.findMany({
        where: { usuarioId: x.sol.id },
        orderBy: { tipo: 'asc' },
      })
      expect(gravadas.map((p) => [p.tipo, p.inApp, p.desktop])).toEqual([
        ['COMENTARIO', false, false],
        ['SLA', true, false],
      ])
      await app.inject({
        method: 'PUT',
        url: '/api/v1/me/preferencias-notificacao',
        headers: x.hSol,
        payload: { itens: [{ tipo: 'COMENTARIO', inApp: true, desktop: true }] },
      })
      expect(await prisma.preferenciaNotificacao.count({ where: { usuarioId: x.sol.id, tipo: 'COMENTARIO' } })).toBe(0)
    })

    it('tipo fixo com inApp=false dá 400; corpo com chave extra ou tipo repetido também', async () => {
      const x = await cenario()
      const put = (payload: Record<string, unknown>) =>
        app.inject({ method: 'PUT', url: '/api/v1/me/preferencias-notificacao', headers: x.hSol, payload })
      const fixo = await put({ itens: [{ tipo: 'MENCAO', inApp: false, desktop: false }] })
      expect(fixo.statusCode).toBe(400)
      expect(fixo.json().erro.detalhes).toBeDefined()
      expect((await put({ itens: [], extra: 1 })).statusCode).toBe(400)
      expect(
        (
          await put({
            itens: [
              { tipo: 'STATUS', inApp: true, desktop: false },
              { tipo: 'STATUS', inApp: true, desktop: true },
            ],
          })
        ).statusCode,
      ).toBe(400)
      expect(await prisma.preferenciaNotificacao.count()).toBe(0)
    })

    it('preferência desligada vale no fanout seguinte (integração)', async () => {
      const x = await cenario()
      await app.inject({
        method: 'PUT',
        url: '/api/v1/me/preferencias-notificacao',
        headers: x.hSol,
        payload: { itens: [{ tipo: 'STATUS', inApp: false, desktop: false }] },
      })
      expect(
        (await prisma.preferenciaNotificacao.findMany({ where: { usuarioId: x.sol.id } })).map((p) => p.tipo),
      ).toEqual(['STATUS'])
    })
  })

  it('T61: a tabela notificacoes não tem coluna de texto de usuário', async () => {
    const colunas = await prisma.$queryRaw<Array<{ column_name: string; data_type: string }>>`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'notificacoes'`
    const nomes = colunas.map((c) => c.column_name)
    expect(nomes).not.toEqual(expect.arrayContaining(['texto']))
    expect(nomes.filter((n) => /texto|mensagem|corpo|conteudo/.test(n))).toEqual([])
    expect(colunas.filter((c) => c.data_type === 'text').map((c) => c.column_name)).toEqual([])
  })
})
