import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarArea, criarUsuario, headersDe, limparBanco } from '../../../test/ajudantes'
import { type BaseSemeada, criarChamado, semearBase } from '../../../test/fabricas'
import { type App, buildApp } from '../../app'
import { prisma } from '../../lib/prisma'

type Item = { id: number; assunto: string; naoLido: boolean; qtdAnexos: number; sla: { solucao: unknown } }

describe('GET /chamados e /chamados/contagens (T34, T42)', () => {
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

  const get = (url: string, headers?: Record<string, string>) =>
    app.inject({ method: 'GET', url, ...(headers ? { headers } : {}) })
  const ids = (res: { json(): { itens: Array<{ id: number }> } }) =>
    res
      .json()
      .itens.map((i) => i.id)
      .sort((a, b) => a - b)

  /**
   * Fixture de 7 chamados. Área A: operador O1. Área B: operador O2. U1 e U2 são USUARIO.
   * c1 ABERTO sem operador · c2 EM_ATENDIMENTO (O1) · c3 PENDENTE (O1) · c4 AGENDADO (O1) · c5 CONCLUIDO (O1)
   * c6 ABERTO na área B · c7 ENCERRADO. Solicitantes: c1 c3 c5 c7 = U1; c2 c4 c6 = U2.
   */
  async function cenario() {
    const A = await criarArea()
    const B = await criarArea()
    const u1 = await criarUsuario({ perfil: 'USUARIO' })
    const u2 = await criarUsuario({ perfil: 'USUARIO' })
    const o1 = await criarUsuario({ perfil: 'OPERADOR', areaId: A.id })
    const o2 = await criarUsuario({ perfil: 'OPERADOR', areaId: B.id })
    const admin = await criarUsuario({ perfil: 'ADMIN' })
    const novo = (
      solicitanteId: number,
      areaId: number,
      papel: Parameters<typeof criarChamado>[0]['papel'],
      operadorId?: number,
    ) => criarChamado({ solicitanteId, areaId, ...(papel ? { papel } : {}), ...(operadorId ? { operadorId } : {}) })
    const c1 = await novo(u1.id, A.id, 'INICIAL')
    const c2 = await novo(u2.id, A.id, 'EM_ATENDIMENTO', o1.id)
    const c3 = await novo(u1.id, A.id, 'AGUARDANDO_SOLICITANTE', o1.id)
    const c4 = await novo(u2.id, A.id, 'AGENDADO', o1.id)
    const c5 = await novo(u1.id, A.id, 'CONCLUIDO', o1.id)
    const c6 = await novo(u2.id, B.id, 'INICIAL')
    const c7 = await novo(u1.id, A.id, 'ENCERRADO')
    return {
      A,
      B,
      u1,
      u2,
      o1,
      o2,
      admin,
      c: { c1: c1.id, c2: c2.id, c3: c3.id, c4: c4.id, c5: c5.id, c6: c6.id, c7: c7.id },
      hU1: await headersDe(u1.id),
      hU2: await headersDe(u2.id),
      hO1: await headersDe(o1.id),
      hO2: await headersDe(o2.id),
      hAdmin: await headersDe(admin.id),
    }
  }

  it('401 sem sessão (lista e contagens)', async () => {
    for (const url of ['/api/v1/chamados', '/api/v1/chamados/contagens']) {
      const res = await get(url)
      expect(res.statusCode, url).toBe(401)
      expect(res.json().erro.codigo).toBe('NAO_AUTENTICADO')
    }
  })

  it('cada visão devolve o conjunto esperado, sempre dentro do escopo', async () => {
    const x = await cenario()
    const visao = async (h: Record<string, string>, v: string) => ids(await get(`/api/v1/chamados?visao=${v}`, h))
    const { c1, c2, c3, c4, c5, c6, c7 } = x.c

    // OPERADOR O1 (área A): não enxerga o c6, da área B
    expect(await visao(x.hO1, 'todos')).toEqual([c1, c2, c3, c4, c5, c7])
    expect(await visao(x.hO1, 'fila-aberta')).toEqual([c1])
    expect(await visao(x.hO1, 'minha-fila')).toEqual([c2, c3])
    expect(await visao(x.hO1, 'agendados')).toEqual([c4])
    expect(await visao(x.hO1, 'minha-area')).toEqual([c1, c2, c3, c4, c5])
    expect(await visao(x.hO1, 'abertos-por-mim')).toEqual([])
    expect(await visao(x.hO1, 'aguardando-validacao')).toEqual([])
    expect(await visao(x.hO1, 'encerrados')).toEqual([c7])

    // USUARIO U1: só o que abriu
    expect(await visao(x.hU1, 'todos')).toEqual([c1, c3, c5, c7])
    expect(await visao(x.hU1, 'abertos-por-mim')).toEqual([c1, c3, c5, c7])
    expect(await visao(x.hU1, 'aguardando-validacao')).toEqual([c5])
    expect(await visao(x.hU1, 'encerrados')).toEqual([c7])
    expect(await visao(x.hU1, 'fila-aberta')).toEqual([]) // USUARIO não tem área

    // O2 só vê a área B
    expect(await visao(x.hO2, 'todos')).toEqual([c6])

    // ADMIN vê tudo, e a fila aberta é de todas as áreas
    expect(await visao(x.hAdmin, 'todos')).toEqual([c1, c2, c3, c4, c5, c6, c7])
    expect(await visao(x.hAdmin, 'fila-aberta')).toEqual([c1, c6])
  })

  it('contagens: uma chave por visão, com os mesmos números das listas, sem o status ignorado', async () => {
    const x = await cenario()
    const res = await get('/api/v1/chamados/contagens', x.hO1)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      'minha-fila': 2,
      'fila-aberta': 1,
      'minha-area': 5,
      agendados: 1,
      'abertos-por-mim': 0,
      'aguardando-validacao': 0,
      encerrados: 1,
      todos: 6,
    })
    const u1 = (await get('/api/v1/chamados/contagens', x.hU1)).json()
    expect(u1).toMatchObject({ todos: 4, 'abertos-por-mim': 4, 'aguardando-validacao': 1, 'fila-aberta': 0 })

    const ignorado = await prisma.status.create({
      data: { nome: 'Ignorado de teste', tipo: 'EM_ATENDIMENTO', ignorado: true },
    })
    await prisma.chamado.update({ where: { id: x.c.c2 }, data: { statusId: ignorado.id } })
    expect((await get('/api/v1/chamados/contagens', x.hO1)).json().todos).toBe(5)
  })

  it('contagens: 30 por minuto por usuário, depois 429', async () => {
    const isolado = await buildApp({ logger: false })
    await isolado.ready()
    try {
      const u = await criarUsuario({ perfil: 'USUARIO' })
      const h = await headersDe(u.id)
      let ultimo = 0
      for (let i = 0; i < 31; i++)
        ultimo = (await isolado.inject({ method: 'GET', url: '/api/v1/chamados/contagens', headers: h })).statusCode
      expect(ultimo).toBe(429)
    } finally {
      await isolado.close()
    }
  })

  it('T34: `solicitanteId` de outro, para USUARIO, devolve só os próprios; `areaIds` e `operadorIds` de outra área não ampliam o escopo', async () => {
    const x = await cenario()
    const outro = await get(`/api/v1/chamados?visao=todos&solicitanteId=${x.u2.id}`, x.hU1)
    expect(outro.statusCode).toBe(200)
    expect(outro.json().total).toBe(0) // c2, c4, c6 são de U2, mas U1 não os enxerga
    expect(ids(await get(`/api/v1/chamados?visao=todos&solicitanteId=${x.u1.id}`, x.hU1))).toEqual([
      x.c.c1,
      x.c.c3,
      x.c.c5,
      x.c.c7,
    ])

    const daB = await get(`/api/v1/chamados?visao=todos&areaIds=${x.B.id}`, x.hO1)
    expect(daB.json().total).toBe(0)
    const doO2 = await get(`/api/v1/chamados?visao=todos&operadorIds=${x.o2.id}`, x.hO1)
    expect(doO2.json().total).toBe(0)
    expect(ids(await get(`/api/v1/chamados?visao=todos&areaIds=${x.A.id}&areaIds=${x.B.id}`, x.hO1))).toEqual([
      x.c.c1,
      x.c.c2,
      x.c.c3,
      x.c.c4,
      x.c.c5,
      x.c.c7,
    ])
  })

  it('T42: porPagina inválido, página inválida, data inválida e visão inválida dão 400', async () => {
    const x = await cenario()
    for (const q of [
      'porPagina=-1',
      'porPagina=1000',
      'porPagina=0',
      'pagina=0',
      'pagina=10001',
      'de=31/01/2026',
      'ate=2026-02-30',
      'visao=qualquer',
      'sla=PAUSADO',
      'busca=a',
      'statusIds=abc',
    ]) {
      const res = await get(`/api/v1/chamados?${q}`, x.hO1)
      expect(res.statusCode, q).toBe(400)
      expect(res.json().erro.codigo).toBe('VALIDACAO')
    }
    expect(res200(await get('/api/v1/chamados?porPagina=100&pagina=1', x.hO1))).toBe(true)
  })

  it('paginação e ordenação (`ordem`, `direcao`) com desempate por id', async () => {
    const x = await cenario()
    const p1 = await get('/api/v1/chamados?visao=todos&porPagina=2&pagina=1', x.hAdmin)
    const p2 = await get('/api/v1/chamados?visao=todos&porPagina=2&pagina=2', x.hAdmin)
    expect(p1.json()).toMatchObject({ total: 7, pagina: 1, porPagina: 2 })
    expect(p1.json().itens.map((i: Item) => i.id)).toEqual([x.c.c7, x.c.c6]) // id desc por padrão
    expect(p2.json().itens.map((i: Item) => i.id)).toEqual([x.c.c5, x.c.c4])
    const asc = await get('/api/v1/chamados?visao=todos&ordem=id&direcao=asc&porPagina=3', x.hAdmin)
    expect(asc.json().itens.map((i: Item) => i.id)).toEqual([x.c.c1, x.c.c2, x.c.c3])
  })

  it('fila aberta: prioridade maior primeiro, depois o mais antigo', async () => {
    const x = await cenario()
    const alta = await prisma.prioridade.findFirstOrThrow({ where: { nome: 'Alta' } })
    const novo = (abertoEm: Date, prioridadeId?: number) =>
      criarChamado({ solicitanteId: x.u1.id, areaId: x.A.id, abertoEm }).then((c) =>
        prioridadeId ? prisma.chamado.update({ where: { id: c.id }, data: { prioridadeId } }) : c,
      )
    const antigoNormal = await novo(new Date(Date.now() - 3 * 3600_000))
    const recenteAlta = await novo(new Date(Date.now() - 1 * 3600_000), alta.id)
    const antigoAlta = await novo(new Date(Date.now() - 2 * 3600_000), alta.id)
    const res = await get('/api/v1/chamados?visao=fila-aberta', x.hO1)
    const ordem = res.json().itens.map((i: Item) => i.id)
    expect(ordem.slice(0, 3)).toEqual([
      antigoAlta.id,
      recenteAlta.id,
      antigoNormal.id < x.c.c1 ? antigoNormal.id : ordem[2],
    ])
    expect(ordem.indexOf(antigoAlta.id)).toBeLessThan(ordem.indexOf(recenteAlta.id))
    expect(ordem.indexOf(recenteAlta.id)).toBeLessThan(ordem.indexOf(antigoNormal.id))
  })

  it('status ignorado (C02) some da lista, salvo `statusIds` explícito ou busca pelo número', async () => {
    const x = await cenario()
    const ignorado = await prisma.status.create({
      data: { nome: 'Ignorado de teste', tipo: 'EM_ATENDIMENTO', ignorado: true },
    })
    await prisma.chamado.update({ where: { id: x.c.c2 }, data: { statusId: ignorado.id } })
    expect(ids(await get('/api/v1/chamados?visao=todos', x.hO1))).not.toContain(x.c.c2)
    expect(ids(await get(`/api/v1/chamados?visao=todos&statusIds=${ignorado.id}`, x.hO1))).toEqual([x.c.c2])
    expect(ids(await get(`/api/v1/chamados?busca=%23${x.c.c2}`, x.hO1))).toEqual([x.c.c2])
  })

  it('busca: número exato, texto sem acento e sem caixa por token; `%` e `_` são literais (S62)', async () => {
    const x = await cenario()
    await prisma.chamado.update({ where: { id: x.c.c1 }, data: { assunto: 'Impressora não imprime' } })
    await prisma.chamado.update({ where: { id: x.c.c2 }, data: { assunto: 'Senha expirada' } })
    expect(ids(await get('/api/v1/chamados?busca=IMPRESS%C3%93RA', x.hO1))).toEqual([x.c.c1]) // sem acento e sem caixa
    expect(ids(await get('/api/v1/chamados?busca=IMPRESSORA', x.hO1))).toEqual([x.c.c1])
    expect(ids(await get('/api/v1/chamados?busca=nao%20imprime', x.hO1))).toEqual([x.c.c1])
    expect(ids(await get('/api/v1/chamados?busca=imprime%20senha', x.hO1))).toEqual([]) // todos os tokens precisam casar
    expect(ids(await get(`/api/v1/chamados?busca=%23${x.c.c3}`, x.hO1))).toEqual([x.c.c3]) // `#N`: o campo exige 2 caracteres
    expect((await get('/api/v1/chamados?busca=%25%25', x.hO1)).json().total).toBe(0)
    expect((await get('/api/v1/chamados?busca=__', x.hO1)).json().total).toBe(0)
  })

  it('sem `visao` e sem `de`, só os últimos 90 dias; `visao` ou `de` desligam o limite', async () => {
    const x = await cenario()
    const velho = await criarChamado({
      solicitanteId: x.u1.id,
      areaId: x.A.id,
      abertoEm: new Date(Date.now() - 120 * 86_400_000),
    })
    expect(ids(await get('/api/v1/chamados', x.hU1))).not.toContain(velho.id)
    expect(ids(await get('/api/v1/chamados?visao=todos', x.hU1))).toContain(velho.id)
    const de = new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10)
    expect(ids(await get(`/api/v1/chamados?de=${de}`, x.hU1))).toContain(velho.id)
  })

  it('`de` e `ate` valem para o dia inteiro no fuso do sistema; `concluidoDe` filtra a conclusão', async () => {
    const x = await cenario()
    // 2026-03-10 23:30 em São Paulo = 2026-03-11T02:30Z
    await prisma.chamado.update({
      where: { id: x.c.c1 },
      data: { abertoEm: new Date('2026-03-11T02:30:00Z'), statusDesde: new Date('2026-03-11T02:30:00Z') },
    })
    expect(ids(await get('/api/v1/chamados?de=2026-03-10&ate=2026-03-10', x.hO1))).toEqual([x.c.c1])
    expect(ids(await get('/api/v1/chamados?de=2026-03-11&ate=2026-03-11', x.hO1))).toEqual([])
    // "hoje" no fuso do sistema (o filtro usa o dia de São Paulo, não o de UTC)
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    expect(ids(await get(`/api/v1/chamados?visao=todos&concluidoDe=${hoje}`, x.hO1))).toEqual([x.c.c5, x.c.c7])
  })

  it('filtros por status, prioridade, canal, operador (0 = sem operador), solicitante e problema', async () => {
    const x = await cenario()
    const alta = await prisma.prioridade.findFirstOrThrow({ where: { nome: 'Alta' } })
    await prisma.chamado.update({ where: { id: x.c.c3 }, data: { prioridadeId: alta.id } })
    expect(ids(await get(`/api/v1/chamados?visao=todos&prioridadeIds=${alta.id}`, x.hO1))).toEqual([x.c.c3])
    expect(
      ids(await get(`/api/v1/chamados?visao=todos&statusIds=${base.statusPorPapel.EM_ATENDIMENTO}`, x.hO1)),
    ).toEqual([x.c.c2])
    expect(ids(await get('/api/v1/chamados?visao=todos&operadorIds=0', x.hO1))).toEqual([x.c.c1, x.c.c7])
    expect(ids(await get(`/api/v1/chamados?visao=todos&operadorIds=0&operadorIds=${x.o1.id}`, x.hO1))).toEqual([
      x.c.c1,
      x.c.c2,
      x.c.c3,
      x.c.c4,
      x.c.c5,
      x.c.c7,
    ])
    expect(ids(await get(`/api/v1/chamados?visao=todos&canalIds=${base.canalTelefoneId}`, x.hO1))).toEqual([])
    expect(ids(await get(`/api/v1/chamados?visao=todos&canalIds=${base.canalWebId}`, x.hO1)).length).toBe(6)
    expect(ids(await get(`/api/v1/chamados?visao=todos&solicitanteId=${x.u2.id}`, x.hO1))).toEqual([x.c.c2, x.c.c4])
  })

  it('tags: "contém todas"; USUARIO com `tagIds` recebe 403', async () => {
    const x = await cenario()
    const t1 = await prisma.tag.create({ data: { nome: 'Rede', nomeNormalizado: 'rede' } })
    const t2 = await prisma.tag.create({ data: { nome: 'Urgente', nomeNormalizado: 'urgente' } })
    await prisma.chamadoTag.createMany({
      data: [
        { chamadoId: x.c.c1, tagId: t1.id },
        { chamadoId: x.c.c1, tagId: t2.id },
        { chamadoId: x.c.c2, tagId: t1.id },
      ],
    })
    expect(ids(await get(`/api/v1/chamados?visao=todos&tagIds=${t1.id}`, x.hO1))).toEqual([x.c.c1, x.c.c2])
    expect(ids(await get(`/api/v1/chamados?visao=todos&tagIds=${t1.id}&tagIds=${t2.id}`, x.hO1))).toEqual([x.c.c1])
    const proibido = await get(`/api/v1/chamados?visao=todos&tagIds=${t1.id}`, x.hU1)
    expect(proibido.statusCode).toBe(403)
    expect(proibido.json().erro.codigo).toBe('SEM_PERMISSAO')
  })

  it('avaliação e rejeição', async () => {
    const x = await cenario()
    await prisma.avaliacaoChamado.create({ data: { chamadoId: x.c.c7, avaliadorId: x.u1.id, nota: 'BOM' } })
    await prisma.chamado.update({ where: { id: x.c.c3 }, data: { rejeicoes: 2 } })
    expect(ids(await get('/api/v1/chamados?visao=todos&avaliacao=BOM', x.hO1))).toEqual([x.c.c7])
    expect(ids(await get('/api/v1/chamados?visao=todos&avaliacao=RUIM', x.hO1))).toEqual([])
    expect(ids(await get('/api/v1/chamados?visao=todos&teveRejeicao=true', x.hO1))).toEqual([x.c.c3])
    expect((await get('/api/v1/chamados?visao=todos&teveRejeicao=false', x.hO1)).json().total).toBe(5)
  })

  it('filtro de SLA segue `situacaoSla`: estourado, em risco e no prazo (só abertos, sem cancelados)', async () => {
    const x = await cenario()
    const h = (n: number) => new Date(Date.now() + n * 3600_000)
    await prisma.chamado.update({
      where: { id: x.c.c1 },
      data: { slaSolucaoMin: 60, prazoSolucaoEm: h(-1), alertaSolucaoEm: h(-2) },
    }) // estourado
    await prisma.chamado.update({
      where: { id: x.c.c2 },
      data: { slaSolucaoMin: 60, prazoSolucaoEm: h(1), alertaSolucaoEm: h(-0.1) },
    }) // em risco
    await prisma.chamado.update({
      where: { id: x.c.c3 },
      data: { slaSolucaoMin: 60, prazoSolucaoEm: h(5), alertaSolucaoEm: h(4) },
    }) // no prazo
    await prisma.chamado.update({
      where: { id: x.c.c4 },
      data: { slaSolucaoMin: 60, prazoSolucaoEm: h(2), alertaSolucaoEm: null },
    }) // no prazo, sem alerta
    await prisma.chamado.update({
      where: { id: x.c.c5 },
      data: { slaSolucaoMin: 60, prazoSolucaoEm: h(-9), alertaSolucaoEm: h(-10) },
    }) // concluído: fora de qualquer filtro
    expect(ids(await get('/api/v1/chamados?visao=todos&sla=ESTOURADO', x.hO1))).toEqual([x.c.c1])
    expect(ids(await get('/api/v1/chamados?visao=todos&sla=EM_RISCO', x.hO1))).toEqual([x.c.c2])
    expect(ids(await get('/api/v1/chamados?visao=todos&sla=NO_PRAZO', x.hO1))).toEqual([x.c.c3, x.c.c4])
  })

  it('campos derivados: `novo` (menos de 10 min), `naoLido` com a regra de interno, `qtdAnexos` sem anexo interno para quem não vê', async () => {
    const x = await cenario()
    const antigo = new Date(Date.now() - 3600_000)
    await prisma.chamado.update({ where: { id: x.c.c1 }, data: { abertoEm: antigo, statusDesde: antigo } })
    const lista = async (h: Record<string, string>) => {
      const res = await get('/api/v1/chamados?visao=todos&porPagina=100', h)
      return new Map<number, Item & { novo: boolean }>(res.json().itens.map((i: Item & { novo: boolean }) => [i.id, i]))
    }
    const comoO1 = await lista(x.hO1)
    expect(comoO1.get(x.c.c1)?.novo).toBe(false)
    expect(comoO1.get(x.c.c2)?.novo).toBe(true)

    // assentamentos: 10 é o último público; 12 é uma nota interna posterior
    await prisma.chamado.update({
      where: { id: x.c.c1 },
      data: { ultimoAssentamentoPublicoId: 10, ultimoAssentamentoId: 12 },
    })
    // U1 (solicitante, não vê interno) compara com o último público; O1 compara com o último qualquer
    await prisma.chamadoLeitura.create({
      data: { chamadoId: x.c.c1, usuarioId: x.u1.id, ultimoAssentamentoLidoId: 10 },
    })
    await prisma.chamadoLeitura.create({
      data: { chamadoId: x.c.c1, usuarioId: x.o1.id, ultimoAssentamentoLidoId: 10 },
    })
    expect((await lista(x.hU1)).get(x.c.c1)?.naoLido).toBe(false)
    expect((await lista(x.hO1)).get(x.c.c1)?.naoLido).toBe(true)
    expect((await lista(x.hO1)).get(x.c.c2)?.naoLido).toBe(false) // sem assentamentos

    const anexo = (interno: boolean) => ({
      id: randomUUID(),
      chamadoId: x.c.c1,
      enviadoPorId: x.o1.id,
      nomeOriginal: 'a.pdf',
      mime: 'application/pdf',
      tamanho: 10,
      sha256: 'a'.repeat(64),
      storageChave: `2026/10/${randomUUID()}`,
      interno,
    })
    await prisma.anexo.createMany({ data: [anexo(false), anexo(true), anexo(true)] })
    expect((await lista(x.hU1)).get(x.c.c1)?.qtdAnexos).toBe(1)
    expect((await lista(x.hO1)).get(x.c.c1)?.qtdAnexos).toBe(3)
  })

  it('o resumo traz o SLA no formato de `situacaoSla` e não vaza campo interno', async () => {
    const x = await cenario()
    const res = await get('/api/v1/chamados?visao=todos', x.hU1)
    const item = res.json().itens[0]
    expect(Object.keys(item.sla.solucao).sort()).toEqual(['alerta', 'cumprido', 'finalizado', 'meta', 'prazo'])
    expect(item).toHaveProperty('status.tipo')
    expect(item).not.toHaveProperty('descricao')
    expect(res.body).not.toMatch(/buscaNorm|busca_norm|descricaoTecnica|senhaHash/)
  })
})

const res200 = (r: { statusCode: number }) => r.statusCode === 200
