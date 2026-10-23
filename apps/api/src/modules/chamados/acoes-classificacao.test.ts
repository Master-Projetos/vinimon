import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco, ORIGEM } from '../../../test/ajudantes'
import {
  type BaseSemeada,
  criarAtivo,
  criarChamado,
  criarDepartamento,
  criarProblema,
  semearBase,
} from '../../../test/fabricas'
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

describe('ações de classificação: classificar, tags e agendar (B13, C09)', () => {
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

  const enviar = (
    metodo: 'POST' | 'PUT',
    id: number,
    acao: string,
    headers: Record<string, string>,
    payload: Record<string, unknown>,
  ) => app.inject({ method: metodo, url: `/api/v1/chamados/${id}/${acao}`, headers, payload })
  const post = (id: number, acao: string, headers: Record<string, string>, payload: Record<string, unknown>) =>
    enviar('POST', id, acao, headers, payload)
  const estado = (id: number) => prisma.chamado.findUniqueOrThrow({ where: { id } })
  const eventos = (id: number) => prisma.chamadoEvento.findMany({ where: { chamadoId: id }, orderBy: { id: 'asc' } })
  const emDias = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString()

  /** O problema P1 é só da área A; P2 é só da B; P3 atende as duas. O chamado está na A, com P1. */
  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const p1 = await criarProblema({ areaIds: [A.id], areaPadraoId: A.id, slaSolucaoMin: 480 })
    const p2 = await criarProblema({ areaIds: [B.id], areaPadraoId: B.id, slaSolucaoMin: 120 })
    const p3 = await criarProblema({ areaIds: [A.id, B.id], areaPadraoId: B.id })
    const u1 = await criarUsuario({ perfil: 'USUARIO' })
    const o1 = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const o2 = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const o3 = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const chamado = await criarChamado({
      solicitanteId: u1.id,
      areaId: A.id,
      problemaId: p1.id,
      papel: 'EM_ATENDIMENTO',
      operadorId: o1.id,
      slaSolucaoMin: 480,
    })
    return {
      A,
      B,
      p1,
      p2,
      p3,
      u1,
      o1,
      o2,
      o3,
      chamado,
      hU1: await headersDe(u1.id),
      hO1: await headersDe(o1.id),
      hO2: await headersDe(o2.id),
      hO3: await headersDe(o3.id),
    }
  }

  describe('classificar', () => {
    it('problema que a área atual atende: só troca o problema, refaz o SLA e não reavalia o acesso', async () => {
      const x = await cenario()
      const res = await post(x.chamado.id, 'classificacao', x.hO1, { versao: 0, problemaId: x.p3.id })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ problema: { id: x.p3.id }, area: { id: x.A.id }, versao: 1 })
      const depois = await estado(x.chamado.id)
      expect(depois.slaSolucaoMin).toBeNull() // P3 não define meta e a prioridade padrão também não
      expect(publicador.revalidarChamado).not.toHaveBeenCalled()
      expect(publicador.emitirChamadoAtualizado).toHaveBeenCalledWith(x.chamado.id, ['classificacao'], false)
      expect(publicador.emitirFila).not.toHaveBeenCalled()
    })

    it('problema que a área atual não atende: a área vira a `areaPadraoId`, `revalidarChamado` roda e o SLA é do problema novo', async () => {
      const x = await cenario()
      const res = await post(x.chamado.id, 'classificacao', x.hO1, { versao: 0, problemaId: x.p2.id })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ problema: { id: x.p2.id }, area: { id: x.B.id } })
      expect(await estado(x.chamado.id)).toMatchObject({ areaId: x.B.id, slaSolucaoMin: 120 })
      expect(publicador.revalidarChamado).toHaveBeenCalledExactlyOnceWith(x.chamado.id)
      expect(publicador.emitirChamadoAtualizado).toHaveBeenCalledWith(x.chamado.id, ['classificacao', 'area'], false)
      expect(publicador.emitirFila).toHaveBeenCalledWith(x.chamado.id, 'encaminhado')
      const ev = (await eventos(x.chamado.id))[0]
      expect(ev).toMatchObject({ tipo: 'CLASSIFICACAO_ALTERADA', interno: false, atorId: x.o1.id })
      expect(ev?.dados).toMatchObject({
        de: { problema: { id: x.p1.id }, area: { id: x.A.id } },
        para: { problema: { id: x.p2.id }, area: { id: x.B.id } },
      })
      // o operador da área antiga continua responsável (a área mudou, o operador não)
      expect(
        await prisma.assentamento.count({
          where: { chamadoId: x.chamado.id, tipo: 'SISTEMA', evento: 'CLASSIFICACAO_ALTERADA' },
        }),
      ).toBe(1)
    })

    it('S53: quem perde o acesso pela troca de área tem as notificações abertas marcadas como lidas', async () => {
      const x = await cenario()
      const doO3 = await prisma.notificacao.create({
        data: { usuarioId: x.o3.id, chamadoId: x.chamado.id, tipo: 'ATUALIZACAO', grupoChave: 'atualizacao:a' },
      })
      await post(x.chamado.id, 'classificacao', x.hO1, { versao: 0, problemaId: x.p2.id })
      expect((await prisma.notificacao.findUniqueOrThrow({ where: { id: doO3.id } })).lidaEm).not.toBeNull()
      expect(publicador.emitirContagem).toHaveBeenCalledWith(x.o3.id, 0)
    })

    it('departamento, ativo e canal: gravam e registram de/para; sem problema, o SLA não muda', async () => {
      const x = await cenario()
      const dep = await criarDepartamento()
      const ativo = await criarAtivo()
      const slaAntes = (await estado(x.chamado.id)).slaSolucaoMin
      const res = await post(x.chamado.id, 'classificacao', x.hO1, {
        versao: 0,
        departamentoId: dep.id,
        ativoId: ativo.id,
        canalId: base.canalTelefoneId,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({
        departamento: { id: dep.id },
        ativo: { id: ativo.id },
        canal: { nome: 'Telefone' },
        area: { id: x.A.id },
      })
      expect((await estado(x.chamado.id)).slaSolucaoMin).toBe(slaAntes)
      expect((await eventos(x.chamado.id))[0]?.dados).toMatchObject({
        para: { departamento: { id: dep.id }, ativo: { id: ativo.id }, canal: { id: base.canalTelefoneId } },
      })
      expect(publicador.revalidarChamado).not.toHaveBeenCalled()
    })

    it('regras: nada informado, problema ou departamento inexistente ou inativo, ativo e canal inválidos dão 422', async () => {
      const x = await cenario()
      const inativo = await prisma.problema.create({ data: { nome: 'Inativo de teste', ativo: false } })
      const semArea = await prisma.problema.create({ data: { nome: 'Sem área padrão' } })
      for (const payload of [
        {},
        { problemaId: 999_999 },
        { problemaId: inativo.id },
        { problemaId: semArea.id },
        { departamentoId: 999_999 },
        { ativoId: 999_999 },
        { canalId: 999_999 },
      ]) {
        const res = await post(x.chamado.id, 'classificacao', x.hO1, { versao: 0, ...payload })
        expect(res.statusCode, JSON.stringify(payload)).toBe(422)
      }
      expect(await estado(x.chamado.id)).toMatchObject({ versao: 0, areaId: x.A.id, problemaId: x.p1.id })
    })

    it('403 em chamado ENCERRADO; 409 com versão velha; 404 fora do escopo; 403 para USUARIO', async () => {
      const x = await cenario()
      const encerrado = await criarChamado({ solicitanteId: x.u1.id, areaId: x.A.id, papel: 'ENCERRADO' })
      expect((await post(encerrado.id, 'classificacao', x.hO1, { versao: 0, problemaId: x.p3.id })).statusCode).toBe(
        403,
      )
      expect((await post(x.chamado.id, 'classificacao', x.hO1, { versao: 9, problemaId: x.p3.id })).statusCode).toBe(
        409,
      )
      expect((await post(x.chamado.id, 'classificacao', x.hO2, { versao: 0, problemaId: x.p3.id })).statusCode).toBe(
        404,
      )
      expect((await post(x.chamado.id, 'classificacao', x.hU1, { versao: 0, problemaId: x.p3.id })).statusCode).toBe(
        403,
      )
      expect((await estado(x.chamado.id)).versao).toBe(0)
    })

    it('em CONCLUIDO ainda classifica (só ENCERRADO bloqueia)', async () => {
      const x = await cenario()
      const concluido = await criarChamado({
        solicitanteId: x.u1.id,
        areaId: x.A.id,
        papel: 'CONCLUIDO',
        operadorId: x.o1.id,
      })
      expect((await post(concluido.id, 'classificacao', x.hO1, { versao: 0, problemaId: x.p3.id })).statusCode).toBe(
        200,
      )
    })
  })

  describe('tags', () => {
    const put = (id: number, headers: Record<string, string>, tags: unknown) =>
      enviar('PUT', id, 'tags', headers, { tags } as Record<string, unknown>)

    it('substitui as tags, cria as que faltam (sem caixa nem espaços) e registra o evento TAGS_ALTERADAS interno, sem comentário de sistema', async () => {
      const x = await cenario()
      const res = await put(x.chamado.id, x.hO1, ['Rede', ' rede ', 'Urgente'])
      expect(res.statusCode).toBe(200)
      expect(res.json().tags.map((t: { nome: string }) => t.nome)).toEqual(['Rede', 'Urgente'])
      expect(res.json().versao).toBe(0) // tags não mexem na versão
      expect(await prisma.chamadoTag.count({ where: { chamadoId: x.chamado.id } })).toBe(2)

      const ev = await eventos(x.chamado.id)
      expect(ev).toHaveLength(1)
      expect(ev[0]).toMatchObject({
        tipo: 'TAGS_ALTERADAS',
        interno: true,
        assentamentoId: null,
        dados: { de: [], para: ['Rede', 'Urgente'] },
      })
      expect(await prisma.assentamento.count({ where: { chamadoId: x.chamado.id } })).toBe(0) // exceção ao padrão de `registrarSistema`
      expect(publicador.emitirChamadoAtualizado).toHaveBeenCalledExactlyOnceWith(x.chamado.id, ['tags'], true) // só a sala interna
      expect(publicador.emitirFila).not.toHaveBeenCalled()
      expect(publicador.emitirAssentamentos).not.toHaveBeenCalled()
    })

    it('trocar e remover: de/para corretos; lista vazia limpa; repetir o mesmo conjunto não gera evento', async () => {
      const x = await cenario()
      await put(x.chamado.id, x.hO1, ['rede', 'vpn'])
      await put(x.chamado.id, x.hO1, ['vpn', 'wifi'])
      const ev = await eventos(x.chamado.id)
      expect(ev[1]?.dados).toMatchObject({ de: ['rede', 'vpn'], para: ['vpn', 'wifi'] })

      const repetido = await put(x.chamado.id, x.hO1, ['wifi', 'VPN'])
      expect(repetido.statusCode).toBe(200)
      expect(await eventos(x.chamado.id)).toHaveLength(2)

      const vazio = await put(x.chamado.id, x.hO1, [])
      expect(vazio.json().tags).toEqual([])
      expect(await prisma.chamadoTag.count({ where: { chamadoId: x.chamado.id } })).toBe(0)
      expect(await eventos(x.chamado.id)).toHaveLength(3)
    })

    it('USUARIO não vê tags no detalhe nem o evento no histórico, e o histórico público do solicitante não muda', async () => {
      const x = await cenario()
      const antes = await prisma.assentamento.count({ where: { chamadoId: x.chamado.id, interno: false } })
      await put(x.chamado.id, x.hO1, ['confidencial'])
      const detalhe = await app.inject({ method: 'GET', url: `/api/v1/chamados/${x.chamado.id}`, headers: x.hU1 })
      expect(detalhe.json()).not.toHaveProperty('tags')
      const historico = await app.inject({
        method: 'GET',
        url: `/api/v1/chamados/${x.chamado.id}/historico`,
        headers: x.hU1,
      })
      expect(historico.json()).toEqual([])
      expect(await prisma.assentamento.count({ where: { chamadoId: x.chamado.id, interno: false } })).toBe(antes) // nada novo para o solicitante
      expect(JSON.stringify(detalhe.json()) + JSON.stringify(historico.json())).not.toMatch(/confidencial/)
    })

    it('regras: mais de 10 tags, tag vazia ou longa, body sem `tags` e chave extra dão 400; USUARIO dá 403; fora do escopo dá 404', async () => {
      const x = await cenario()
      for (const tags of [Array.from({ length: 11 }, (_, i) => `t${i}`), [''], ['a'.repeat(31)], 'rede']) {
        expect((await put(x.chamado.id, x.hO1, tags)).statusCode, JSON.stringify(tags).slice(0, 30)).toBe(400)
      }
      expect((await enviar('PUT', x.chamado.id, 'tags', x.hO1, { tags: ['a'], versao: 0 })).statusCode).toBe(400)
      expect((await put(x.chamado.id, x.hU1, ['a'])).statusCode).toBe(403)
      expect((await put(x.chamado.id, x.hO2, ['a'])).statusCode).toBe(404)
      expect((await put(999_999, x.hO1, ['a'])).statusCode).toBe(404)
      expect(await prisma.chamadoTag.count()).toBe(0)
    })

    it('funciona em chamado ENCERRADO (qualquer tipo)', async () => {
      const x = await cenario()
      const encerrado = await criarChamado({ solicitanteId: x.u1.id, areaId: x.A.id, papel: 'ENCERRADO' })
      expect((await put(encerrado.id, x.hO1, ['historico'])).statusCode).toBe(200)
    })
  })

  describe('agendar', () => {
    it('papel AGENDADO, `agendadoPara`, operador atual mantido, 1ª resposta, evento e comentário com a data no fuso do sistema', async () => {
      const x = await cenario()
      const para = emDias(2)
      const res = await post(x.chamado.id, 'agendar', x.hO1, { versao: 0, para })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({
        status: { tipo: 'AGENDADO', papel: 'AGENDADO' },
        operador: { id: x.o1.id },
        versao: 1,
      })
      const depois = await estado(x.chamado.id)
      expect(depois.agendadoPara?.toISOString()).toBe(new Date(para).toISOString())
      expect(depois.slaPausado).toBe(true)
      expect(depois.primeiraRespostaEm).not.toBeNull()
      expect((await eventos(x.chamado.id))[0]).toMatchObject({ tipo: 'AGENDADO', dados: { operadorId: x.o1.id } })
      const sistema = await prisma.assentamento.findFirstOrThrow({
        where: { chamadoId: x.chamado.id, evento: 'AGENDADO' },
      })
      expect(sistema.texto).toMatch(/^Agendado para \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
      expect(publicador.emitirChamadoAtualizado).toHaveBeenCalledWith(
        x.chamado.id,
        ['agendamento', 'status', 'operador'],
        false,
      )
    })

    it('agendar no passado, em menos de 1 minuto ou além de 365 dias dá 422; o limite de 1 minuto e o de 365 dias valem', async () => {
      const x = await cenario()
      for (const para of [
        new Date(Date.now() - 3600_000).toISOString(),
        new Date(Date.now() + 20_000).toISOString(),
        emDias(366),
      ]) {
        const res = await post(x.chamado.id, 'agendar', x.hO1, { versao: 0, para })
        expect(res.statusCode, para).toBe(422)
        expect(res.json().erro.codigo).toBe('REGRA_NEGOCIO')
      }
      expect(
        (
          await post(x.chamado.id, 'agendar', x.hO1, {
            versao: 0,
            para: new Date(Date.now() + 2 * 60_000).toISOString(),
          })
        ).statusCode,
      ).toBe(200)
      expect((await post(x.chamado.id, 'agendar', x.hO1, { versao: 1, para: emDias(364) })).statusCode).toBe(200) // reagendar a partir de AGENDADO
      expect((await estado(x.chamado.id)).versao).toBe(2)
    })

    it('data sem horário ou texto livre dá 400', async () => {
      const x = await cenario()
      for (const para of ['2026-11-05', 'amanhã', ''])
        expect((await post(x.chamado.id, 'agendar', x.hO1, { versao: 0, para })).statusCode, para).toBe(400)
    })

    it('operador opcional: ativo, da área do chamado (ou ADMIN); sem operador e sem responsável, fica quem agenda', async () => {
      const x = await cenario()
      const ok = await post(x.chamado.id, 'agendar', x.hO1, { versao: 0, para: emDias(1), operadorId: x.o3.id })
      expect(ok.statusCode).toBe(200)
      expect(ok.json().operador.id).toBe(x.o3.id)
      expect(
        (await prisma.chamadoSeguidor.findMany({ where: { chamadoId: x.chamado.id, usuarioId: x.o3.id } })).map(
          (s) => s.motivo,
        ),
      ).toEqual(['ATRIBUIDO'])

      const outro = await criarChamado({ solicitanteId: x.u1.id, areaId: x.A.id })
      for (const operadorId of [x.o2.id, x.u1.id, 999_999]) {
        expect(
          (await post(outro.id, 'agendar', x.hO1, { versao: 0, para: emDias(1), operadorId })).statusCode,
          `${operadorId}`,
        ).toBe(422)
      }
      const semResponsavel = await post(outro.id, 'agendar', x.hO1, { versao: 0, para: emDias(1) })
      expect(semResponsavel.json().operador.id).toBe(x.o1.id)
    })

    it('1ª resposta segue `chamado.primeiraRespostaAoEncaminhar`', async () => {
      const x = await cenario()
      const marca = async (cfg: string, marcar?: boolean) => {
        await prisma.config.upsert({
          where: { chave: 'chamado.primeiraRespostaAoEncaminhar' },
          create: { chave: 'chamado.primeiraRespostaAoEncaminhar', valor: cfg },
          update: { valor: cfg },
        })
        invalidarConfig()
        const c = await criarChamado({ solicitanteId: x.u1.id, areaId: x.A.id, operadorId: x.o1.id })
        await post(c.id, 'agendar', x.hO1, {
          versao: 0,
          para: emDias(1),
          ...(marcar === undefined ? {} : { marcarPrimeiraResposta: marcar }),
        })
        return (await estado(c.id)).primeiraRespostaEm !== null
      }
      expect(await marca('ESCOLHA')).toBe(true)
      expect(await marca('ESCOLHA', false)).toBe(false)
      expect(await marca('SEMPRE', false)).toBe(true)
      expect(await marca('NUNCA', true)).toBe(false)
    })

    it('regras: 403 em CONCLUIDO e ENCERRADO, 409 com versão velha, 404 fora do escopo, 403 para USUARIO', async () => {
      const x = await cenario()
      for (const papel of ['CONCLUIDO', 'ENCERRADO'] as const) {
        const c = await criarChamado({ solicitanteId: x.u1.id, areaId: x.A.id, papel })
        expect((await post(c.id, 'agendar', x.hO1, { versao: 0, para: emDias(1) })).statusCode, papel).toBe(403)
      }
      expect((await post(x.chamado.id, 'agendar', x.hO1, { versao: 4, para: emDias(1) })).statusCode).toBe(409)
      expect((await post(x.chamado.id, 'agendar', x.hO2, { versao: 0, para: emDias(1) })).statusCode).toBe(404)
      expect((await post(x.chamado.id, 'agendar', x.hU1, { versao: 0, para: emDias(1) })).statusCode).toBe(403)
      const noSemSessao = await app.inject({
        method: 'POST',
        url: `/api/v1/chamados/${x.chamado.id}/agendar`,
        headers: { origin: ORIGEM },
        payload: { versao: 0, para: emDias(1) },
      })
      expect(noSemSessao.statusCode).toBe(401)
      const estadoFinal = await estado(x.chamado.id)
      expect(estadoFinal).toMatchObject({ versao: 0, agendadoPara: null })
      expect(await prisma.chamadoEstagio.count({ where: { chamadoId: x.chamado.id } })).toBe(0)
    })
  })
})
