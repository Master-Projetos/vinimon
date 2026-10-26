import { describe, expect, it } from 'vitest'
import {
  ACOES_CHAMADO,
  AgendarChamadoSchema,
  AssumirChamadoSchema,
  ChamadoAcoesSchema,
  ChamadoContagensSchema,
  ChamadoDetalheSchema,
  ChamadoFiltrosSchema,
  ChamadoResumoSchema,
  ConcluirChamadoSchema,
  CriarChamadoSchema,
  chamadosApi,
  RejeitarChamadoSchema,
  VISOES_CHAMADO,
} from './chamados'

const valido = { assunto: 'Impressora parada', descricao: 'Não imprime desde ontem', problemaId: 3 }

describe('CriarChamadoSchema (T36)', () => {
  it('aceita o mínimo e os campos opcionais', () => {
    expect(CriarChamadoSchema.safeParse(valido).success).toBe(true)
    expect(
      CriarChamadoSchema.safeParse({
        ...valido,
        areaId: 1,
        ativoId: 2,
        tags: ['rede', 'urgente'],
        contatoEmail: 'a@b.com',
        telefone: '(11) 99999-0000',
      }).success,
    ).toBe(true)
  })

  it('statusId e qualquer chave desconhecida dão erro', () => {
    for (const extra of [{ statusId: 1 }, { perfil: 'ADMIN' }, { operadorId: 4 }]) {
      expect(CriarChamadoSchema.safeParse({ ...valido, ...extra }).success).toBe(false)
    }
  })

  it('limites: assunto curto, descrição vazia, mais de 10 tags, e-mail inválido', () => {
    expect(CriarChamadoSchema.safeParse({ ...valido, assunto: 'ab' }).success).toBe(false)
    expect(CriarChamadoSchema.safeParse({ ...valido, descricao: '   ' }).success).toBe(false)
    expect(
      CriarChamadoSchema.safeParse({ ...valido, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).success,
    ).toBe(false)
    expect(CriarChamadoSchema.safeParse({ ...valido, contatoEmail: 'sem-arroba' }).success).toBe(false)
    expect(CriarChamadoSchema.safeParse({ ...valido, problemaId: 0 }).success).toBe(false)
  })
})

describe('bodies das ações', () => {
  it('exigem `versao` inteira e não negativa e recusam chave desconhecida', () => {
    expect(AssumirChamadoSchema.safeParse({}).success).toBe(false)
    expect(AssumirChamadoSchema.safeParse({ versao: -1 }).success).toBe(false)
    expect(AssumirChamadoSchema.safeParse({ versao: 1.5 }).success).toBe(false)
    expect(AssumirChamadoSchema.safeParse({ versao: 0, confirmarTroca: true, comentario: 'ok' }).success).toBe(true)
    expect(AssumirChamadoSchema.safeParse({ versao: 0, operadorId: 2 }).success).toBe(false)
  })

  it('agendar exige data ISO com horário', () => {
    expect(AgendarChamadoSchema.safeParse({ versao: 0, para: '2026-11-05T14:00:00-03:00' }).success).toBe(true)
    expect(AgendarChamadoSchema.safeParse({ versao: 0, para: '2026-11-05' }).success).toBe(false)
    expect(AgendarChamadoSchema.safeParse({ versao: 0, para: 'amanhã' }).success).toBe(false)
  })

  it('concluir exige solução; rejeitar exige motivo de 5 a 2.000 caracteres', () => {
    expect(ConcluirChamadoSchema.safeParse({ versao: 0 }).success).toBe(false)
    expect(
      ConcluirChamadoSchema.safeParse({ versao: 0, solucao: 'Trocado o toner', descricaoTecnica: 'Cartucho 85A' })
        .success,
    ).toBe(true)
    expect(RejeitarChamadoSchema.safeParse({ versao: 0, motivo: 'não' }).success).toBe(false)
    expect(RejeitarChamadoSchema.safeParse({ versao: 0, motivo: 'Continua sem imprimir' }).success).toBe(true)
  })
})

describe('ChamadoFiltrosSchema', () => {
  it('aplica os padrões de paginação, ordem e direção', () => {
    expect(ChamadoFiltrosSchema.parse({})).toMatchObject({ pagina: 1, ordem: 'id', direcao: 'desc' })
  })

  it('aceita todas as visões e recusa visão inválida', () => {
    for (const visao of VISOES_CHAMADO) expect(ChamadoFiltrosSchema.safeParse({ visao }).success, visao).toBe(true)
    expect(ChamadoFiltrosSchema.safeParse({ visao: 'qualquer' }).success).toBe(false)
  })

  it('`de`/`ate`/`concluidoDe` só aceitam data ISO (AAAA-MM-DD)', () => {
    expect(ChamadoFiltrosSchema.safeParse({ de: '2026-01-31', ate: '2026-02-28' }).success).toBe(true)
    for (const campo of ['de', 'ate', 'concluidoDe', 'concluidoAte']) {
      expect(ChamadoFiltrosSchema.safeParse({ [campo]: '31/01/2026' }).success, campo).toBe(false)
      expect(ChamadoFiltrosSchema.safeParse({ [campo]: '2026-02-30' }).success, campo).toBe(false)
    }
  })

  it('listas de ids aceitam ?x=1 e ?x=1&x=2; `operadorIds` aceita 0 (sem operador)', () => {
    expect(ChamadoFiltrosSchema.parse({ statusIds: '3' }).statusIds).toEqual([3])
    expect(ChamadoFiltrosSchema.parse({ statusIds: ['3', '4'] }).statusIds).toEqual([3, 4])
    expect(ChamadoFiltrosSchema.parse({ operadorIds: ['0', '7'] }).operadorIds).toEqual([0, 7])
    expect(ChamadoFiltrosSchema.safeParse({ statusIds: ['0'] }).success).toBe(false)
    expect(ChamadoFiltrosSchema.safeParse({ statusIds: 'abc' }).success).toBe(false)
  })

  it('sla, avaliação, ordem, paginação e booleano são validados', () => {
    expect(
      ChamadoFiltrosSchema.safeParse({
        sla: 'EM_RISCO',
        avaliacao: ['BOM', 'RUIM'],
        teveRejeicao: 'true',
        ordem: 'prazoSolucao',
      }).success,
    ).toBe(true)
    expect(ChamadoFiltrosSchema.safeParse({ sla: 'PAUSADO' }).success).toBe(false)
    expect(ChamadoFiltrosSchema.safeParse({ avaliacao: 'PESSIMO' }).success).toBe(false)
    expect(ChamadoFiltrosSchema.safeParse({ ordem: 'nome' }).success).toBe(false)
    expect(ChamadoFiltrosSchema.safeParse({ porPagina: 101 }).success).toBe(false)
    expect(ChamadoFiltrosSchema.safeParse({ pagina: 0 }).success).toBe(false)
    expect(ChamadoFiltrosSchema.safeParse({ busca: 'a' }).success).toBe(false)
  })
})

describe('schemas de resposta', () => {
  const data = '2026-10-22T12:00:00.000Z'
  const prazo = { meta: 480, prazo: data, alerta: data, cumprido: null, finalizado: false }
  const resumo = {
    id: 10,
    assunto: 'Impressora parada',
    novo: true,
    cancelado: false,
    status: { id: 1, nome: 'Aberto', tipo: 'ABERTO', papel: 'INICIAL', cor: '#3b5bd4' },
    prioridade: { id: 2, nome: 'Normal', cor: '#888888', ordem: 2 },
    area: { id: 1, nome: 'TI' },
    problema: null,
    solicitante: { id: 5, nome: 'Ana' },
    operador: null,
    abertoEm: data,
    agendadoPara: null,
    ultimaAtividadeEm: data,
    ultimaInteracao: null,
    naoLido: false,
    qtdAnexos: 0,
    sla: { resposta: prazo, solucao: { ...prazo, prazo: null } },
  }
  const acoes = Object.fromEntries(ACOES_CHAMADO.map((a) => [a, false]))
  const detalhe = {
    ...resumo,
    descricao: 'Texto',
    solucao: null,
    contato: null,
    contatoEmail: null,
    telefone: null,
    abertoPor: { id: 5, nome: 'Ana' },
    canal: { id: 1, nome: 'Sistema Web' },
    departamento: null,
    ativo: null,
    primeiraRespostaEm: null,
    concluidoEm: null,
    encerradoEm: null,
    validacaoLimiteEm: null,
    statusDesde: data,
    rejeicoes: 0,
    versao: 0,
    participantes: [{ id: 5, nome: 'Ana', papel: 'SOLICITANTE' }],
    avaliacao: null,
    seguindo: true,
    acoes,
  }

  it('resumo e detalhe convertem as datas para Date; `tags` e `descricaoTecnica` são opcionais', () => {
    const r = ChamadoResumoSchema.parse(resumo)
    expect(r.abertoEm).toBeInstanceOf(Date)
    expect(r.sla.solucao.prazo).toBeNull()
    const d = ChamadoDetalheSchema.parse(detalhe)
    expect(d.tags).toBeUndefined()
    expect(d.descricaoTecnica).toBeUndefined()
    expect(
      ChamadoDetalheSchema.parse({ ...detalhe, tags: [{ id: 1, nome: 'rede' }], descricaoTecnica: 'x' }).tags,
    ).toHaveLength(1)
  })

  it('o resumo recusa tipo de status fora do enum e data inválida', () => {
    expect(ChamadoResumoSchema.safeParse({ ...resumo, status: { ...resumo.status, tipo: 'OUTRO' } }).success).toBe(
      false,
    )
    expect(ChamadoResumoSchema.safeParse({ ...resumo, abertoEm: 'ontem' }).success).toBe(false)
  })

  it('ações: as 15 chaves de `acoesDoUsuario`, todas booleanas', () => {
    expect(ACOES_CHAMADO).toHaveLength(15)
    expect(Object.keys(ChamadoAcoesSchema.shape).sort()).toEqual([...ACOES_CHAMADO].sort())
    expect(ChamadoAcoesSchema.safeParse({ ...acoes, assumir: 'sim' }).success).toBe(false)
  })

  it('contagens trazem uma chave por visão', () => {
    expect(Object.keys(ChamadoContagensSchema.shape).sort()).toEqual([...VISOES_CHAMADO].sort())
  })
})

describe('chamadosApi', () => {
  it('tem as rotas do cartão, com método e caminho de §3.6', () => {
    const rotas = Object.entries(chamadosApi).map(([nome, c]) => `${nome} ${c.metodo} ${c.caminho}`)
    expect(rotas).toEqual([
      'listar GET /chamados',
      'contagens GET /chamados/contagens',
      'reincidencia GET /chamados/reincidencia',
      'criar POST /chamados',
      'obter GET /chamados/:id',
      'historico GET /chamados/:id/historico',
      'assumir POST /chamados/:id/assumir',
      'encaminhar POST /chamados/:id/encaminhar',
      'status POST /chamados/:id/status',
      'prioridade POST /chamados/:id/prioridade',
      'classificacao POST /chamados/:id/classificacao',
      'tags PUT /chamados/:id/tags',
      'agendar POST /chamados/:id/agendar',
      'concluir POST /chamados/:id/concluir',
      'aprovar POST /chamados/:id/aprovar',
      'rejeitar POST /chamados/:id/rejeitar',
      'solicitarRetorno POST /chamados/:id/solicitar-retorno',
      'reabrir POST /chamados/:id/reabrir',
      'cancelar POST /chamados/:id/cancelar',
      'definirPai POST /chamados/:id/pai',
      'adicionarAuxiliar POST /chamados/:id/auxiliares',
      'removerAuxiliar DELETE /chamados/:id/auxiliares/:usuarioId',
      'seguir PUT /chamados/:id/seguir',
      'deixarDeSeguir DELETE /chamados/:id/seguir',
    ])
    expect(chamadosApi.criar.status).toBe(201)
    expect(chamadosApi.seguir.status).toBe(204)
  })
})
