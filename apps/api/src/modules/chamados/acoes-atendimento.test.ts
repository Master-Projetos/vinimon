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

describe('ações de atendimento: assumir, encaminhar, status e prioridade (S47, S53, C06, C07, C11)', () => {
  let app: App
  let base: BaseSemeada
  let publicador: ReturnType<typeof espiao>
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
    publicador = espiao()
    definirTempoReal(publicador)
  })
  afterEach(() => {
    definirTempoReal(original)
  })

  const post = (id: number, acao: string, headers: Record<string, string>, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/v1/chamados/${id}/${acao}`, headers, payload })

  /** A e B atendem; O1 e O3 são da A, O2 é da B. U1 abriu o chamado (área A). */
  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const problema = await criarProblema({
      areaIds: [A.id, B.id],
      areaPadraoId: A.id,
      slaSolucaoMin: 480,
      slaRespostaMin: 60,
    })
    const u1 = await criarUsuario({ perfil: 'USUARIO' })
    const u2 = await criarUsuario({ perfil: 'USUARIO' })
    const o1 = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const o2 = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const o3 = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const novo = (papel: Parameters<typeof criarChamado>[0]['papel'], operadorId?: number) =>
      criarChamado({
        solicitanteId: u1.id,
        areaId: A.id,
        problemaId: problema.id,
        slaSolucaoMin: 480,
        slaRespostaMin: 60,
        ...(papel ? { papel } : {}),
        ...(operadorId ? { operadorId } : {}),
      })
    return {
      A,
      B,
      problema,
      u1,
      u2,
      o1,
      o2,
      o3,
      admin,
      novo,
      hU1: await headersDe(u1.id),
      hU2: await headersDe(u2.id),
      hO1: await headersDe(o1.id),
      hO2: await headersDe(o2.id),
      hO3: await headersDe(o3.id),
      hAdmin: await headersDe(admin.id),
    }
  }

  const estado = (id: number) => prisma.chamado.findUniqueOrThrow({ where: { id } })
  const eventos = (id: number) => prisma.chamadoEvento.findMany({ where: { chamadoId: id }, orderBy: { id: 'asc' } })

  describe('assumir', () => {
    it('em ABERTO: vira EM_ATENDIMENTO com o operador, marca a 1ª resposta, segue como ATRIBUIDO e registra evento e comentário de sistema', async () => {
      const x = await cenario()
      const c = await x.novo('INICIAL')
      const res = await post(c.id, 'assumir', x.hO1, { versao: 0, comentario: 'Vou verificar agora.' })
      expect(res.statusCode).toBe(200)
      const d = res.json()
      expect(d).toMatchObject({
        versao: 1,
        operador: { id: x.o1.id },
        status: { tipo: 'EM_ATENDIMENTO', papel: 'EM_ATENDIMENTO' },
      })
      expect(d.acoes).toMatchObject({ concluir: true, assumir: true })

      const noBanco = await estado(c.id)
      expect(noBanco.primeiraRespostaEm).not.toBeNull() // o operador não é o solicitante
      expect(noBanco.slaRespostaCumprido).toBe(true)
      expect(
        await prisma.chamadoSeguidor.findMany({
          where: { chamadoId: c.id, usuarioId: x.o1.id },
          select: { motivo: true },
        }),
      ).toEqual([{ motivo: 'ATRIBUIDO' }])
      const ev = await eventos(c.id)
      expect(ev).toHaveLength(1)
      expect(ev[0]).toMatchObject({ tipo: 'ASSUMIDO', atorId: x.o1.id, dados: { de: null, para: x.o1.id } })
      const ass = await prisma.assentamento.findMany({ where: { chamadoId: c.id }, orderBy: { id: 'asc' } })
      expect(ass.map((a) => [a.tipo, a.interno, a.texto.slice(0, 18)])).toEqual([
        ['SISTEMA', false, 'Chamado assumido p'],
        ['COMENTARIO', false, 'Vou verificar agor'],
      ])
      expect(await prisma.chamadoEstagio.count({ where: { chamadoId: c.id } })).toBe(1)
    })

    it('em EM_ATENDIMENTO ou PENDENTE: só troca o operador, sem mudar o status', async () => {
      const x = await cenario()
      const c = await x.novo('AGUARDANDO_SOLICITANTE')
      const res = await post(c.id, 'assumir', x.hO1, { versao: 0 })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ operador: { id: x.o1.id }, status: { tipo: 'PENDENTE' }, versao: 1 })
      expect(await prisma.chamadoEstagio.count({ where: { chamadoId: c.id } })).toBe(0)
    })

    it('com outro responsável: sem `confirmarTroca` dá 409; com `confirmarTroca` troca e registra o anterior', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o3.id)
      const sem = await post(c.id, 'assumir', x.hO1, { versao: 0 })
      expect(sem.statusCode).toBe(409)
      expect(sem.json().erro.codigo).toBe('CONFLITO')
      expect((await estado(c.id)).operadorId).toBe(x.o3.id)
      expect((await estado(c.id)).versao).toBe(0)

      const com = await post(c.id, 'assumir', x.hO1, { versao: 0, confirmarTroca: true })
      expect(com.statusCode).toBe(200)
      expect(com.json().operador.id).toBe(x.o1.id)
      expect((await eventos(c.id))[0]?.dados).toMatchObject({ de: x.o3.id, para: x.o1.id })
    })

    it('quem já é o responsável pode assumir de novo sem confirmar', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      expect((await post(c.id, 'assumir', x.hO1, { versao: 0 })).statusCode).toBe(200)
    })

    it('a 1ª resposta é gravada uma vez só; assumir de novo não a muda', async () => {
      const x = await cenario()
      const c = await x.novo('INICIAL')
      await post(c.id, 'assumir', x.hO1, { versao: 0 })
      const primeira = (await estado(c.id)).primeiraRespostaEm
      await post(c.id, 'assumir', x.hO3, { versao: 1, confirmarTroca: true })
      expect((await estado(c.id)).primeiraRespostaEm).toEqual(primeira)
    })

    it('se o solicitante é quem assume (operador do próprio chamado), não há 1ª resposta', async () => {
      const x = await cenario()
      const meu = await criarChamado({ solicitanteId: x.o1.id, areaId: x.A.id })
      expect((await post(meu.id, 'assumir', x.hO1, { versao: 0 })).statusCode).toBe(200)
      expect((await estado(meu.id)).primeiraRespostaEm).toBeNull()
    })
  })

  describe('encaminhar', () => {
    it('para operador de outra área: papel ENCAMINHADO, nova área, jornada e SLA recalculados, seguidor ATRIBUIDO e `revalidarChamado`', async () => {
      const x = await cenario()
      await prisma.area.update({ where: { id: x.B.id }, data: { jornadaId: base.jornadaComercialId } })
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      const res = await post(c.id, 'encaminhar', x.hO1, {
        versao: 0,
        areaId: x.B.id,
        operadorId: x.o2.id,
        comentario: 'Cabe à rede.',
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({
        area: { id: x.B.id },
        operador: { id: x.o2.id },
        status: { papel: 'ENCAMINHADO' },
        versao: 1,
      })
      const noBanco = await estado(c.id)
      expect(noBanco.jornadaId).toBe(base.jornadaComercialId)
      expect(noBanco.slaSolucaoMin).toBe(480)
      expect(noBanco.prazoSolucaoEm).not.toBeNull()
      expect(
        (await prisma.chamadoSeguidor.findMany({ where: { chamadoId: c.id, usuarioId: x.o2.id } })).map(
          (s) => s.motivo,
        ),
      ).toEqual(['ATRIBUIDO'])
      expect(publicador.revalidarChamado).toHaveBeenCalledExactlyOnceWith(c.id)
      expect(publicador.emitirFila).toHaveBeenCalledWith(c.id, 'encaminhado')
      expect((await eventos(c.id))[0]).toMatchObject({
        tipo: 'ENCAMINHADO',
        dados: { deArea: { id: x.A.id }, paraArea: { id: x.B.id }, operador: { id: x.o2.id } },
      })
    })

    it('sem operador: volta para a fila (papel INICIAL, `operadorId` nulo)', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      const res = await post(c.id, 'encaminhar', x.hO1, { versao: 0, areaId: x.B.id })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({
        area: { id: x.B.id },
        operador: null,
        status: { tipo: 'ABERTO', papel: 'INICIAL' },
      })
    })

    it('regras do destino: área inativa, que não atende ou inexistente; operador inativo, de outra área, USUARIO — dão 422', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      const inativa = await criarArea()
      await prisma.area.update({ where: { id: inativa.id }, data: { ativo: false } })
      const naoAtende = await criarArea({ atende: false })
      const operadorInativo = await criarUsuario({ perfil: 'OPERADOR', areaId: x.B.id, ativo: false })
      for (const payload of [
        { areaId: inativa.id },
        { areaId: naoAtende.id },
        { areaId: 999_999 },
        { areaId: x.B.id, operadorId: operadorInativo.id },
        { areaId: x.B.id, operadorId: x.o1.id }, // o1 é da área A, não da B
        { areaId: x.B.id, operadorId: x.u2.id }, // USUARIO não atende
        { areaId: x.B.id, operadorId: 999_999 },
      ]) {
        const res = await post(c.id, 'encaminhar', x.hO1, { versao: 0, ...payload })
        expect(res.statusCode, JSON.stringify(payload)).toBe(422)
        expect(res.json().erro.codigo).toBe('REGRA_NEGOCIO')
      }
      expect((await estado(c.id)).areaId).toBe(x.A.id) // nada mudou
      expect((await estado(c.id)).versao).toBe(0)
    })

    it('ADMIN como operador de destino vale mesmo sem área', async () => {
      const x = await cenario()
      const c = await x.novo('INICIAL')
      const res = await post(c.id, 'encaminhar', x.hO1, { versao: 0, areaId: x.B.id, operadorId: x.admin.id })
      expect(res.statusCode).toBe(200)
      expect(res.json().operador.id).toBe(x.admin.id)
    })

    it('1ª resposta segue `chamado.primeiraRespostaAoEncaminhar` (ESCOLHA padrão, SEMPRE, NUNCA)', async () => {
      const x = await cenario()
      const marca = async (cfg: string, marcar?: boolean) => {
        await prisma.config.upsert({
          where: { chave: 'chamado.primeiraRespostaAoEncaminhar' },
          create: { chave: 'chamado.primeiraRespostaAoEncaminhar', valor: cfg },
          update: { valor: cfg },
        })
        invalidarConfig()
        const c = await x.novo('INICIAL')
        await post(c.id, 'encaminhar', x.hO1, {
          versao: 0,
          areaId: x.B.id,
          ...(marcar === undefined ? {} : { marcarPrimeiraResposta: marcar }),
        })
        return (await estado(c.id)).primeiraRespostaEm !== null
      }
      expect(await marca('ESCOLHA')).toBe(true) // caixa marcada por padrão
      expect(await marca('ESCOLHA', false)).toBe(false)
      expect(await marca('SEMPRE', false)).toBe(true)
      expect(await marca('NUNCA', true)).toBe(false)
    })

    it('S53: notificações abertas de quem perdeu o acesso são marcadas como lidas e a contagem é reemitida; quem continua vendo não muda', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      const nova = (usuarioId: number, grupoChave: string) =>
        prisma.notificacao.create({ data: { usuarioId, chamadoId: c.id, tipo: 'ATUALIZACAO', grupoChave } })
      const doO3 = await nova(x.o3.id, 'atualizacao:a') // O3 é da área A: perde o acesso
      const doU1 = await nova(x.u1.id, 'atualizacao:b') // o solicitante continua vendo
      const doO2 = await nova(x.o2.id, 'atualizacao:c') // O2 é da B (destino): passa a ver, nada a limpar
      await prisma.notificacao.create({
        data: {
          usuarioId: x.o3.id,
          chamadoId: c.id,
          tipo: 'STATUS',
          grupoChave: 'status:z',
          lidaEm: new Date('2026-01-01T00:00:00Z'),
        },
      })

      await post(c.id, 'encaminhar', x.hO1, { versao: 0, areaId: x.B.id, operadorId: x.o2.id })
      expect((await prisma.notificacao.findUniqueOrThrow({ where: { id: doO3.id } })).lidaEm).not.toBeNull()
      expect((await prisma.notificacao.findUniqueOrThrow({ where: { id: doU1.id } })).lidaEm).toBeNull()
      expect((await prisma.notificacao.findUniqueOrThrow({ where: { id: doO2.id } })).lidaEm).toBeNull()
      // o fanout do evento também reemite a contagem de outros usuários: aqui importa o O3 zerado
      expect(publicador.emitirContagem).toHaveBeenCalledWith(x.o3.id, 0)
    })
  })

  describe('status', () => {
    it('troca entre tipos em curso: fecha o estágio, atualiza `statusDesde`, marca a 1ª resposta, registra de/para e emite status', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      const res = await post(c.id, 'status', x.hO1, { versao: 0, statusId: base.statusPorPapel.AGUARDANDO_SOLICITANTE })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ status: { tipo: 'PENDENTE' }, versao: 1 })
      const noBanco = await estado(c.id)
      expect(noBanco.slaPausado).toBe(true)
      expect(noBanco.primeiraRespostaEm).not.toBeNull()
      expect(await prisma.chamadoEstagio.count({ where: { chamadoId: c.id } })).toBe(1)
      expect((await eventos(c.id))[0]).toMatchObject({
        tipo: 'STATUS_ALTERADO',
        dados: { para: { id: base.statusPorPapel.AGUARDANDO_SOLICITANTE } },
      })
      expect(publicador.emitirFila).toHaveBeenCalledWith(c.id, 'status')
      expect(publicador.emitirChamadoAtualizado).toHaveBeenCalledWith(c.id, ['status'], false)
    })

    it('voltar para ABERTO limpa o operador', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      const res = await post(c.id, 'status', x.hO1, { versao: 0, statusId: base.statusPorPapel.INICIAL })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ operador: null, status: { tipo: 'ABERTO' } })
    })

    it('destino AGENDADO, CONCLUIDO ou ENCERRADO tem ação própria (422); mesmo status e status inexistente também dão 422', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      const inativo = await prisma.status.create({ data: { nome: 'Inativo de teste', tipo: 'PENDENTE', ativo: false } })
      for (const statusId of [
        base.statusPorPapel.AGENDADO,
        base.statusPorPapel.CONCLUIDO,
        base.statusPorPapel.ENCERRADO,
        base.statusPorPapel.CANCELADO,
        base.statusPorPapel.EM_ATENDIMENTO,
        999_999,
        inativo.id,
      ]) {
        const res = await post(c.id, 'status', x.hO1, { versao: 0, statusId })
        expect(res.statusCode, `${statusId}`).toBe(422)
      }
      expect((await estado(c.id)).versao).toBe(0)
    })
  })

  describe('prioridade', () => {
    it('troca a prioridade, refaz o snapshot de SLA (meta do problema vale) e registra de/para', async () => {
      const x = await cenario()
      const alta = await prisma.prioridade.findFirstOrThrow({ where: { nome: 'Alta' } })
      await prisma.prioridade.update({ where: { id: alta.id }, data: { slaSolucaoMin: 60, slaRespostaMin: 10 } })
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      const res = await post(c.id, 'prioridade', x.hO1, { versao: 0, prioridadeId: alta.id })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ prioridade: { id: alta.id }, versao: 1 })
      // o problema define 480/60: a meta dele vence a da prioridade
      expect(await estado(c.id)).toMatchObject({ prioridadeId: alta.id, slaSolucaoMin: 480, slaRespostaMin: 60 })
      expect((await eventos(c.id))[0]).toMatchObject({ tipo: 'PRIORIDADE_ALTERADA', dados: { para: { id: alta.id } } })
      expect(publicador.emitirFila).toHaveBeenCalledWith(c.id, 'prioridade')
    })

    it('sem meta no problema, a meta nova vem da prioridade e o prazo muda', async () => {
      const x = await cenario()
      const semMeta = await criarProblema({ areaIds: [x.A.id], areaPadraoId: x.A.id })
      const alta = await prisma.prioridade.findFirstOrThrow({ where: { nome: 'Alta' } })
      await prisma.prioridade.update({ where: { id: alta.id }, data: { slaSolucaoMin: 90 } })
      const c = await criarChamado({
        solicitanteId: x.u1.id,
        areaId: x.A.id,
        problemaId: semMeta.id,
        papel: 'EM_ATENDIMENTO',
        operadorId: x.o1.id,
      })
      await post(c.id, 'prioridade', x.hO1, { versao: 0, prioridadeId: alta.id })
      const depois = await estado(c.id)
      expect(depois.slaSolucaoMin).toBe(90)
      expect(depois.prazoSolucaoEm?.getTime()).toBe(depois.abertoEm.getTime() + 90 * 60_000) // 24x7
    })

    it('mesma prioridade, inexistente ou inativa dão 422', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      const inativa = await prisma.prioridade.create({ data: { nome: 'Inativa de teste', ordem: 9, ativo: false } })
      for (const prioridadeId of [base.prioridadePadraoId, 999_999, inativa.id]) {
        expect((await post(c.id, 'prioridade', x.hO1, { versao: 0, prioridadeId })).statusCode, `${prioridadeId}`).toBe(
          422,
        )
      }
    })
  })

  describe('para todas as ações (tabela)', () => {
    const acoes = (x: Awaited<ReturnType<typeof cenario>>, base: BaseSemeada) => ({
      assumir: { versao: 0 },
      encaminhar: { versao: 0, areaId: x.B.id },
      status: { versao: 0, statusId: base.statusPorPapel.AGUARDANDO_SOLICITANTE },
      prioridade: { versao: 0, prioridadeId: 0 }, // preenchido abaixo
    })
    const corpoDe = async (x: Awaited<ReturnType<typeof cenario>>, acao: string) => {
      const alta = await prisma.prioridade.findFirstOrThrow({ where: { nome: 'Alta' } })
      return { ...acoes(x, base), prioridade: { versao: 0, prioridadeId: alta.id } }[acao as 'assumir'] as Record<
        string,
        unknown
      >
    }
    const ACOES = ['assumir', 'encaminhar', 'status', 'prioridade']

    it('permitido: o operador da área faz cada ação em chamado em curso', async () => {
      for (const acao of ACOES) {
        await limparBanco()
        invalidarConfig()
        base = await semearBase()
        const x = await cenario()
        const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
        const res = await post(c.id, acao, x.hO1, await corpoDe(x, acao))
        expect(res.statusCode, acao).toBe(200)
        expect(res.json().versao, acao).toBe(1)
      }
    })

    it('401 sem sessão; 403 para USUARIO (rota exige `chamado.atender`), inclusive o solicitante', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      for (const acao of ACOES) {
        const corpo = await corpoDe(x, acao)
        const sem = await app.inject({
          method: 'POST',
          url: `/api/v1/chamados/${c.id}/${acao}`,
          headers: { origin: ORIGEM },
          payload: corpo,
        })
        expect(sem.statusCode, acao).toBe(401)
        for (const h of [x.hU1, x.hU2]) {
          const res = await post(c.id, acao, h, corpo)
          expect(res.statusCode, `${acao} usuario`).toBe(403)
          expect(res.json().erro.codigo).toBe('SEM_PERMISSAO')
        }
      }
    })

    it('fora do escopo dá 404, igual a inexistente: operador de outra área e chamado que não existe', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      for (const acao of ACOES) {
        const corpo = await corpoDe(x, acao)
        const fora = await post(c.id, acao, x.hO2, corpo)
        const inexistente = await post(999_999, acao, x.hO2, corpo)
        expect(fora.statusCode, acao).toBe(404)
        expect(inexistente.statusCode, acao).toBe(404)
        expect({ ...fora.json().erro, requestId: 0 }).toEqual({ ...inexistente.json().erro, requestId: 0 })
      }
      expect((await estado(c.id)).versao).toBe(0)
    })

    it('tipo de status errado dá 403 (a ação não está disponível): CONCLUIDO e ENCERRADO', async () => {
      const x = await cenario()
      for (const papel of ['CONCLUIDO', 'ENCERRADO'] as const) {
        const c = await x.novo(papel, x.o1.id)
        for (const acao of ['assumir', 'encaminhar', 'status']) {
          const res = await post(c.id, acao, x.hO1, await corpoDe(x, acao))
          expect(res.statusCode, `${papel} ${acao}`).toBe(403)
        }
      }
      const concluido = await x.novo('CONCLUIDO', x.o1.id)
      expect((await post(concluido.id, 'prioridade', x.hO1, await corpoDe(x, 'prioridade'))).statusCode).toBe(403)
      const agendado = await x.novo('AGENDADO', x.o1.id)
      expect((await post(agendado.id, 'assumir', x.hO1, await corpoDe(x, 'assumir'))).statusCode).toBe(403)
    })

    it('versão velha dá 409 e não deixa nada para trás: nem estágio, nem evento, nem comentário', async () => {
      for (const acao of ACOES) {
        await limparBanco()
        invalidarConfig()
        base = await semearBase()
        const x = await cenario()
        const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
        const res = await post(c.id, acao, x.hO1, { ...(await corpoDe(x, acao)), versao: 5 })
        expect(res.statusCode, acao).toBe(409)
        expect(res.json().erro.codigo).toBe('CONFLITO')
        expect(await estado(c.id)).toMatchObject({ versao: 0, areaId: x.A.id, operadorId: x.o1.id })
        expect(await prisma.chamadoEstagio.count({ where: { chamadoId: c.id } })).toBe(0)
        expect(await eventos(c.id)).toHaveLength(0)
        expect(await prisma.assentamento.count({ where: { chamadoId: c.id } })).toBe(0)
        expect(publicador.emitirFila).not.toHaveBeenCalled()
        publicador.emitirFila.mockClear()
      }
    })

    it('duas ações com a mesma versão: só a primeira vence', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      const [a, b] = await Promise.all([
        post(c.id, 'prioridade', x.hO1, await corpoDe(x, 'prioridade')),
        post(c.id, 'status', x.hO3, { versao: 0, statusId: base.statusPorPapel.AGUARDANDO_SOLICITANTE }),
      ])
      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
      expect((await estado(c.id)).versao).toBe(1)
    })

    it('400 para body inválido ou com chave desconhecida, e sem `versao`', async () => {
      const x = await cenario()
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      expect((await post(c.id, 'assumir', x.hO1, {})).statusCode).toBe(400)
      expect((await post(c.id, 'assumir', x.hO1, { versao: 0, operadorId: 3 })).statusCode).toBe(400)
      expect((await post(c.id, 'status', x.hO1, { versao: 0 })).statusCode).toBe(400)
      expect((await post(c.id, 'encaminhar', x.hO1, { versao: 0 })).statusCode).toBe(400)
      expect((await post(c.id, 'prioridade', x.hO1, { versao: -1, prioridadeId: 1 })).statusCode).toBe(400)
    })

    it('erro do publicador não derruba a ação', async () => {
      const x = await cenario()
      for (const metodo of [
        'emitirAssentamentos',
        'emitirChamadoAtualizado',
        'emitirFila',
        'revalidarChamado',
      ] as const) {
        publicador[metodo].mockImplementation(() => {
          throw new Error('socket fora')
        })
      }
      const c = await x.novo('EM_ATENDIMENTO', x.o1.id)
      expect((await post(c.id, 'encaminhar', x.hO1, { versao: 0, areaId: x.B.id })).statusCode).toBe(200)
    })
  })
})
