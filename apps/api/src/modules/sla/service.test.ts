import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, limparBanco } from '../../../test/ajudantes'
import { type BaseSemeada, criarChamado, criarProblema, semearBase } from '../../../test/fabricas'
import { invalidarConfig } from '../../lib/config'
import { ErroApp } from '../../lib/erros'
import { definirFila, enfileirar, filasEmMemoria, limparFilaMemoria } from '../../lib/filas'
import { prisma } from '../../lib/prisma'
import { recalcularSla } from './recalculo'
import {
  aplicarTransicaoStatus,
  carregarCalendario,
  invalidarCalendario,
  recalcularChamado,
  snapshotSla,
} from './service'

const z = (iso: string) => new Date(iso)

describe('serviço de SLA (§4.6)', () => {
  let base: BaseSemeada

  beforeEach(async () => {
    await limparBanco()
    invalidarCalendario()
    invalidarConfig()
    base = await semearBase()
  })

  const novoChamado = async (extra: Partial<Parameters<typeof criarChamado>[0]> = {}) => {
    const solicitante = await criarUsuario({ perfil: 'USUARIO' })
    const area = await criarArea()
    return criarChamado({ solicitanteId: solicitante.id, areaId: area.id, ...extra })
  }
  const transicao = (
    chamadoId: number,
    versao: number,
    papel: keyof BaseSemeada['statusPorPapel'],
    agora: Date,
    extras?: Parameters<typeof aplicarTransicaoStatus>[1]['extras'],
  ) =>
    prisma.$transaction((tx) =>
      aplicarTransicaoStatus(tx, {
        chamadoId,
        versao,
        novoStatusId: base.statusPorPapel[papel],
        atorId: null,
        agora,
        ...(extras ? { extras } : {}),
      }),
    )

  it('caso 27: ABERTO → PENDENTE → EM_ATENDIMENTO → CONCLUIDO → rejeitado → CONCLUIDO bate com recalcularSla direto', async () => {
    // Segunda 2026-10-26 08:00 em São Paulo (11:00Z), jornada Comercial: seg–sex 08–12 e 13–18
    const abertoEm = z('2026-10-26T11:00:00Z')
    const c = await novoChamado({
      jornadaId: base.jornadaComercialId,
      abertoEm,
      slaRespostaMin: 60,
      slaSolucaoMin: 240,
    })
    await prisma.chamado.update({ where: { id: c.id }, data: { primeiraRespostaEm: z('2026-10-26T11:30:00Z') } })

    await transicao(c.id, 0, 'AGUARDANDO_SOLICITANTE', z('2026-10-26T12:00:00Z')) // pausa
    await transicao(c.id, 1, 'EM_ATENDIMENTO', z('2026-10-26T13:00:00Z'))
    await transicao(c.id, 2, 'CONCLUIDO', z('2026-10-26T14:00:00Z'), {
      solucao: 'Trocado o toner',
      validacaoLimiteEm: z('2026-10-29T14:00:00Z'),
    })
    await transicao(c.id, 3, 'EM_ATENDIMENTO', z('2026-10-26T15:00:00Z')) // rejeitado: reabre o atendimento
    await transicao(c.id, 4, 'CONCLUIDO', z('2026-10-26T16:00:00Z'), { solucao: 'Trocado o toner de novo' })

    const final = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })
    const estagios = await prisma.chamadoEstagio.findMany({ where: { chamadoId: c.id }, orderBy: { id: 'asc' } })
    expect(final.versao).toBe(5)
    expect(estagios.map((e) => [e.statusTipo, e.pausaSla, e.inicioEm.toISOString(), e.fimEm.toISOString()])).toEqual([
      ['ABERTO', false, '2026-10-26T11:00:00.000Z', '2026-10-26T12:00:00.000Z'],
      ['PENDENTE', true, '2026-10-26T12:00:00.000Z', '2026-10-26T13:00:00.000Z'],
      ['EM_ATENDIMENTO', false, '2026-10-26T13:00:00.000Z', '2026-10-26T14:00:00.000Z'],
      ['CONCLUIDO', true, '2026-10-26T14:00:00.000Z', '2026-10-26T15:00:00.000Z'], // CONCLUIDO sempre pausa o SLA (CHECK do banco)
      ['EM_ATENDIMENTO', false, '2026-10-26T15:00:00.000Z', '2026-10-26T16:00:00.000Z'],
    ])

    const cal = await prisma.$transaction((tx) => carregarCalendario(tx, base.jornadaComercialId))
    const esperado = recalcularSla(
      {
        abertoEm,
        slaRespostaMin: 60,
        slaSolucaoMin: 240,
        primeiraRespostaEm: z('2026-10-26T11:30:00Z'),
        concluidoEm: z('2026-10-26T16:00:00Z'),
        pausas: [
          { inicio: z('2026-10-26T12:00:00Z'), fim: z('2026-10-26T13:00:00Z') },
          { inicio: z('2026-10-26T14:00:00Z'), fim: z('2026-10-26T15:00:00Z') }, // aguardando a validação, depois rejeitada
        ],
        alertaPct: 80,
      },
      cal,
    )
    expect(final.statusTipo).toBe('CONCLUIDO')
    expect(final.concluidoEm).toEqual(z('2026-10-26T16:00:00Z'))
    for (const campo of Object.keys(esperado) as Array<keyof typeof esperado>)
      expect(final[campo], campo).toEqual(esperado[campo])
    expect(final.slaPausadoSeg).toBeGreaterThan(0)
  })

  it('`versao` errada dá CONFLITO e não deixa nada para trás', async () => {
    const c = await novoChamado()
    const erro = await transicao(c.id, 7, 'EM_ATENDIMENTO', new Date()).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroApp)
    expect(erro).toMatchObject({ status: 409, codigo: 'CONFLITO' })
    const depois = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })
    expect(depois.versao).toBe(0)
    expect(depois.statusTipo).toBe('ABERTO')
    expect(await prisma.chamadoEstagio.count({ where: { chamadoId: c.id } })).toBe(0)
  })

  it('duas transições com a mesma versão: só a primeira vence', async () => {
    const c = await novoChamado()
    await transicao(c.id, 0, 'EM_ATENDIMENTO', new Date())
    await expect(transicao(c.id, 0, 'AGUARDANDO_SOLICITANTE', new Date())).rejects.toMatchObject({ codigo: 'CONFLITO' })
    expect((await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })).statusTipo).toBe('EM_ATENDIMENTO')
  })

  it('status inexistente ou inativo dá 422; chamado inexistente dá 404', async () => {
    const c = await novoChamado()
    const inativo = await prisma.status.create({ data: { nome: 'Inativo de teste', tipo: 'PENDENTE', ativo: false } })
    for (const id of [999_999, inativo.id]) {
      const erro = await prisma
        .$transaction((tx) =>
          aplicarTransicaoStatus(tx, { chamadoId: c.id, versao: 0, novoStatusId: id, atorId: null, agora: new Date() }),
        )
        .catch((e: unknown) => e)
      expect(erro, `${id}`).toMatchObject({ status: 422 })
    }
    await expect(transicao(999_999, 0, 'EM_ATENDIMENTO', new Date())).rejects.toMatchObject({ status: 404 })
  })

  it('ajusta datas e operador conforme o tipo novo', async () => {
    const operador = await criarUsuario({ perfil: 'OPERADOR' })
    const c = await novoChamado({ operadorId: operador.id, papel: 'EM_ATENDIMENTO' })
    const t1 = z('2026-10-26T12:00:00Z')

    await transicao(c.id, 0, 'AGENDADO', t1, { agendadoPara: z('2026-10-27T12:00:00Z') })
    let atual = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })
    expect(atual).toMatchObject({ statusTipo: 'AGENDADO', slaPausado: true, operadorId: operador.id })
    expect(atual.agendadoPara).toEqual(z('2026-10-27T12:00:00Z'))

    await transicao(c.id, 1, 'INICIAL', t1) // ABERTO: limpa o operador e o agendamento
    atual = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })
    expect(atual).toMatchObject({
      statusTipo: 'ABERTO',
      operadorId: null,
      agendadoPara: null,
      concluidoEm: null,
      encerradoEm: null,
    })

    await transicao(c.id, 2, 'ENCERRADO', z('2026-10-26T13:00:00Z'), { solucao: 'ok' })
    atual = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })
    expect(atual.concluidoEm).toEqual(z('2026-10-26T13:00:00Z'))
    expect(atual.encerradoEm).toEqual(z('2026-10-26T13:00:00Z'))

    await transicao(c.id, 3, 'EM_ATENDIMENTO', z('2026-10-27T13:00:00Z')) // reabertura limpa as datas
    atual = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })
    expect(atual).toMatchObject({ concluidoEm: null, encerradoEm: null, validacaoLimiteEm: null })
  })

  it('CONCLUIDO mantém o `concluidoEm` que já existia (`??=`)', async () => {
    const c = await novoChamado({ papel: 'EM_ATENDIMENTO' })
    await prisma.chamado.update({ where: { id: c.id }, data: { slaSolucaoMin: 60 } })
    await transicao(c.id, 0, 'CONCLUIDO', z('2026-10-26T12:00:00Z'), { solucao: 'a' })
    const antes = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })
    await transicao(c.id, 1, 'ENCERRADO', z('2026-10-27T12:00:00Z'))
    const depois = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })
    expect(depois.concluidoEm).toEqual(antes.concluidoEm)
    expect(depois.encerradoEm).toEqual(z('2026-10-27T12:00:00Z'))
  })

  describe('snapshotSla', () => {
    it('meta do problema vence a da prioridade; o que o problema não define vem da prioridade', async () => {
      const area = await criarArea()
      await prisma.prioridade.update({
        where: { id: base.prioridadePadraoId },
        data: { slaRespostaMin: 30, slaSolucaoMin: 600 },
      })
      const problema = await criarProblema({ areaIds: [area.id], slaSolucaoMin: 120 })
      const s = await prisma.$transaction((tx) =>
        snapshotSla(tx, { problemaId: problema.id, prioridadeId: base.prioridadePadraoId, areaId: area.id }),
      )
      expect(s).toMatchObject({ slaSolucaoMin: 120, slaRespostaMin: 30 })
      const semProblema = await prisma.$transaction((tx) =>
        snapshotSla(tx, { problemaId: null, prioridadeId: base.prioridadePadraoId, areaId: area.id }),
      )
      expect(semProblema).toMatchObject({ slaSolucaoMin: 600, slaRespostaMin: 30 })
    })

    it('sem meta em nenhum dos dois, não há SLA', async () => {
      const area = await criarArea()
      await prisma.prioridade.update({
        where: { id: base.prioridadePadraoId },
        data: { slaRespostaMin: null, slaSolucaoMin: null },
      })
      const s = await prisma.$transaction((tx) =>
        snapshotSla(tx, { problemaId: null, prioridadeId: base.prioridadePadraoId, areaId: area.id }),
      )
      expect(s).toMatchObject({ slaRespostaMin: null, slaSolucaoMin: null })
    })

    it('jornada: a da área; senão `sla.jornadaPadraoId`; senão a primeira ininterrupta', async () => {
      const comJornada = await criarArea()
      await prisma.area.update({ where: { id: comJornada.id }, data: { jornadaId: base.jornadaComercialId } })
      const semJornada = await criarArea()
      const dados = (areaId: number) => ({ problemaId: null, prioridadeId: base.prioridadePadraoId, areaId })
      expect((await prisma.$transaction((tx) => snapshotSla(tx, dados(comJornada.id)))).jornadaId).toBe(
        base.jornadaComercialId,
      )
      expect((await prisma.$transaction((tx) => snapshotSla(tx, dados(semJornada.id)))).jornadaId).toBe(
        base.jornada24x7Id,
      )
      await prisma.config.upsert({
        where: { chave: 'sla.jornadaPadraoId' },
        create: { chave: 'sla.jornadaPadraoId', valor: base.jornadaComercialId },
        update: { valor: base.jornadaComercialId },
      })
      invalidarConfig()
      expect((await prisma.$transaction((tx) => snapshotSla(tx, dados(semJornada.id)))).jornadaId).toBe(
        base.jornadaComercialId,
      )
    })

    it('prioridade ou área inexistente dá 422', async () => {
      const area = await criarArea()
      await expect(
        prisma.$transaction((tx) => snapshotSla(tx, { problemaId: null, prioridadeId: 999_999, areaId: area.id })),
      ).rejects.toMatchObject({ status: 422 })
      await expect(
        prisma.$transaction((tx) =>
          snapshotSla(tx, { problemaId: null, prioridadeId: base.prioridadePadraoId, areaId: 999_999 }),
        ),
      ).rejects.toMatchObject({ status: 422 })
    })
  })

  describe('carregarCalendario', () => {
    it('cache de 60 s por jornada, e `invalidarCalendario` força nova leitura', async () => {
      const a = await prisma.$transaction((tx) => carregarCalendario(tx, base.jornadaComercialId))
      const b = await prisma.$transaction((tx) => carregarCalendario(tx, base.jornadaComercialId))
      expect(b).toBe(a)
      invalidarCalendario(base.jornadaComercialId)
      const c = await prisma.$transaction((tx) => carregarCalendario(tx, base.jornadaComercialId))
      expect(c).not.toBe(a)
      expect(c.horarios.length).toBeGreaterThan(0)
      expect(c.timezone).toBe('America/Sao_Paulo')
    })

    it('feriados: global vale para todas, o da jornada só para ela, recorrente vira MM-dd (data UTC do @db.Date)', async () => {
      await prisma.feriado.create({
        data: { data: z('2026-03-17T00:00:00Z'), nome: 'Global de teste', recorrente: false, jornadaId: null },
      })
      await prisma.feriado.create({
        data: {
          data: z('2000-03-18T00:00:00Z'),
          nome: 'Recorrente só da comercial',
          recorrente: true,
          jornadaId: base.jornadaComercialId,
        },
      })
      await prisma.feriado.create({
        data: { data: z('2026-12-31T00:00:00Z'), nome: 'Só da 24x7', recorrente: false, jornadaId: base.jornada24x7Id },
      })
      const comercial = await prisma.$transaction((tx) => carregarCalendario(tx, base.jornadaComercialId))
      expect(comercial.feriados.has('2026-03-17')).toBe(true)
      expect(comercial.feriadosRecorrentes.has('03-18')).toBe(true)
      expect(comercial.feriados.has('2026-12-31')).toBe(false)
      const j24 = await prisma.$transaction((tx) => carregarCalendario(tx, base.jornada24x7Id))
      expect(j24.feriados.has('2026-03-17')).toBe(true)
      expect(j24.feriados.has('2026-12-31')).toBe(true)
      expect(j24.feriadosRecorrentes.has('03-18')).toBe(false)
    })

    it('jornada inexistente dá 404', async () => {
      await expect(prisma.$transaction((tx) => carregarCalendario(tx, 999_999))).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('recalcularChamado', () => {
    it('grava prazos e alertas; se mudarem, zera os avisos; se não mudarem, mantém', async () => {
      const abertoEm = z('2026-10-26T11:00:00Z')
      const c = await novoChamado({ abertoEm, slaSolucaoMin: 100 })
      await prisma.$transaction((tx) => recalcularChamado(tx, c.id, abertoEm))
      let atual = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })
      expect(atual.prazoSolucaoEm).toEqual(z('2026-10-26T12:40:00Z')) // 24x7: abertura + 100 min
      expect(atual.alertaSolucaoEm).toEqual(z('2026-10-26T12:20:00Z')) // 80%

      await prisma.chamado.update({
        where: { id: c.id },
        data: { slaAvisoRiscoEm: abertoEm, slaAvisoEstouroEm: abertoEm },
      })
      await prisma.$transaction((tx) => recalcularChamado(tx, c.id, abertoEm)) // nada mudou
      atual = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })
      expect(atual.slaAvisoRiscoEm).toEqual(abertoEm)

      await prisma.chamado.update({ where: { id: c.id }, data: { slaSolucaoMin: 200 } }) // meta nova → prazos novos
      await prisma.$transaction((tx) => recalcularChamado(tx, c.id, abertoEm))
      atual = await prisma.chamado.findUniqueOrThrow({ where: { id: c.id } })
      expect(atual.prazoSolucaoEm).toEqual(z('2026-10-26T14:20:00Z'))
      expect(atual.slaAvisoRiscoEm).toBeNull()
      expect(atual.slaAvisoEstouroEm).toBeNull()
    })

    it('sem meta, sem prazo; pausa em curso antes do prazo deixa prazo e alerta nulos', async () => {
      const abertoEm = z('2026-10-26T11:00:00Z')
      const sem = await novoChamado({ abertoEm })
      await prisma.$transaction((tx) => recalcularChamado(tx, sem.id, abertoEm))
      expect(await prisma.chamado.findUniqueOrThrow({ where: { id: sem.id } })).toMatchObject({
        prazoSolucaoEm: null,
        alertaSolucaoEm: null,
      })

      const pausado = await novoChamado({ abertoEm, papel: 'AGUARDANDO_SOLICITANTE', slaSolucaoMin: 120 })
      await prisma.$transaction((tx) => recalcularChamado(tx, pausado.id, abertoEm))
      expect(await prisma.chamado.findUniqueOrThrow({ where: { id: pausado.id } })).toMatchObject({
        prazoSolucaoEm: null,
        alertaSolucaoEm: null,
        slaPausado: true,
      })
    })

    it('chamado inexistente dá 404', async () => {
      await expect(prisma.$transaction((tx) => recalcularChamado(tx, 999_999, new Date()))).rejects.toMatchObject({
        status: 404,
      })
    })
  })
})

describe('porta de filas (§3.10)', () => {
  afterEach(() => {
    limparFilaMemoria()
    definirFila(filasEmMemoria)
  })

  it('o padrão é a memória: guarda fila, dados e opções, e `limparFilaMemoria` zera', async () => {
    await enfileirar('eventos-varrer', { a: 1 })
    await enfileirar(
      'sla-recalcular-jornada',
      { jornadaId: 2 },
      { singletonKey: 'j2', startAfter: 5, retryLimit: 3, retryBackoff: true },
    )
    expect(filasEmMemoria.enviados).toEqual([
      { fila: 'eventos-varrer', dados: { a: 1 }, opcoes: undefined },
      {
        fila: 'sla-recalcular-jornada',
        dados: { jornadaId: 2 },
        opcoes: { singletonKey: 'j2', startAfter: 5, retryLimit: 3, retryBackoff: true },
      },
    ])
    limparFilaMemoria()
    expect(filasEmMemoria.enviados).toHaveLength(0)
  })

  it('`definirFila` troca a implementação (o pg-boss da T-7.6) e repassa as opções sem mudança', async () => {
    const chamadas: unknown[][] = []
    definirFila({
      async enviar(...args) {
        chamadas.push(args)
      },
    })
    await enfileirar('fila-x', { b: 2 }, { startAfter: 10 })
    await enfileirar('fila-y', {})
    expect(chamadas).toEqual([
      ['fila-x', { b: 2 }, { startAfter: 10 }],
      ['fila-y', {}],
    ])
    expect(filasEmMemoria.enviados).toHaveLength(0)
  })
})
