import { describe, expect, it } from 'vitest'
import { type ContextoDestinatarios, destinatarios } from './regras'

function ctx(extra: Partial<ContextoDestinatarios> = {}): ContextoDestinatarios {
  return {
    chamado: { id: 50, solicitanteId: 1, operadorId: 10, areaId: 7 },
    seguidores: [
      { usuarioId: 1, silenciado: false },
      { usuarioId: 10, silenciado: false },
      { usuarioId: 20, silenciado: false },
      { usuarioId: 30, silenciado: true },
    ],
    operadoresDaArea: [10, 11, 12],
    mencionados: [],
    ator: 99,
    ...extra,
  }
}

const ordenar = <T extends { usuarioId: number }>(l: T[]) => [...l].sort((a, b) => a.usuarioId - b.usuarioId)

describe('destinatarios', () => {
  it('CRIADO: operadores da área recebem NOVO_NA_FILA', () => {
    const r = ordenar(destinatarios({ tipo: 'CRIADO', id: 5, abertoEmNomeDeOutro: false }, ctx()))
    expect(r).toEqual([
      { usuarioId: 10, tipo: 'NOVO_NA_FILA', grupoChave: 'novo:5' },
      { usuarioId: 11, tipo: 'NOVO_NA_FILA', grupoChave: 'novo:5' },
      { usuarioId: 12, tipo: 'NOVO_NA_FILA', grupoChave: 'novo:5' },
    ])
  })

  it('CRIADO em nome de outro: solicitante recebe ATUALIZACAO', () => {
    const r = ordenar(destinatarios({ tipo: 'CRIADO', id: 5, abertoEmNomeDeOutro: true }, ctx()))
    expect(r[0]).toEqual({ usuarioId: 1, tipo: 'ATUALIZACAO', grupoChave: 'atualizacao:50' })
    expect(r).toHaveLength(4)
  })

  it('COMENTARIO: seguidores não silenciados e mencionados', () => {
    const r = ordenar(destinatarios({ tipo: 'COMENTARIO', id: 6 }, ctx({ mencionados: [20, 40] })))
    expect(r).toEqual([
      { usuarioId: 1, tipo: 'COMENTARIO', grupoChave: 'comentario:50' },
      { usuarioId: 10, tipo: 'COMENTARIO', grupoChave: 'comentario:50' },
      { usuarioId: 20, tipo: 'MENCAO', grupoChave: 'mencao:6' },
      { usuarioId: 40, tipo: 'MENCAO', grupoChave: 'mencao:6' },
    ])
  })

  it('COMENTARIO: silenciado mencionado ainda recebe MENCAO', () => {
    const r = destinatarios({ tipo: 'COMENTARIO', id: 6 }, ctx({ mencionados: [30] }))
    expect(r).toContainEqual({ usuarioId: 30, tipo: 'MENCAO', grupoChave: 'mencao:6' })
    expect(r).toHaveLength(4)
  })

  it('ASSUMIDO com operador: novo operador ATRIBUIDO, demais seguidores ATUALIZACAO', () => {
    const r = ordenar(destinatarios({ tipo: 'ASSUMIDO', id: 7, operadorNovoId: 10 }, ctx()))
    expect(r).toEqual([
      { usuarioId: 1, tipo: 'ATUALIZACAO', grupoChave: 'atualizacao:50' },
      { usuarioId: 10, tipo: 'ATRIBUIDO', grupoChave: 'atribuido:7' },
      { usuarioId: 20, tipo: 'ATUALIZACAO', grupoChave: 'atualizacao:50' },
    ])
  })

  it('ENCAMINHADO com operador que não é seguidor: ATRIBUIDO ignora silenciamento', () => {
    const r = destinatarios({ tipo: 'ENCAMINHADO', id: 8, operadorNovoId: 30 }, ctx())
    expect(r).toContainEqual({ usuarioId: 30, tipo: 'ATRIBUIDO', grupoChave: 'atribuido:8' })
    expect(r.filter((d) => d.usuarioId === 30)).toHaveLength(1)
  })

  it('ENCAMINHADO sem operador: operadores da área NOVO_NA_FILA, seguidores ATUALIZACAO', () => {
    const r = ordenar(destinatarios({ tipo: 'ENCAMINHADO', id: 9, operadorNovoId: null }, ctx()))
    expect(r).toEqual([
      { usuarioId: 1, tipo: 'ATUALIZACAO', grupoChave: 'atualizacao:50' },
      { usuarioId: 10, tipo: 'NOVO_NA_FILA', grupoChave: 'novo:9' },
      { usuarioId: 11, tipo: 'NOVO_NA_FILA', grupoChave: 'novo:9' },
      { usuarioId: 12, tipo: 'NOVO_NA_FILA', grupoChave: 'novo:9' },
      { usuarioId: 20, tipo: 'ATUALIZACAO', grupoChave: 'atualizacao:50' },
    ])
  })

  for (const tipo of ['STATUS_ALTERADO', 'AGENDADO', 'RETORNO_AGENDAMENTO', 'REABERTO', 'CANCELADO'] as const) {
    it(`${tipo}: seguidores não silenciados recebem STATUS`, () => {
      const r = ordenar(destinatarios({ tipo }, ctx()))
      expect(r).toEqual([
        { usuarioId: 1, tipo: 'STATUS', grupoChave: 'status:50' },
        { usuarioId: 10, tipo: 'STATUS', grupoChave: 'status:50' },
        { usuarioId: 20, tipo: 'STATUS', grupoChave: 'status:50' },
      ])
    })
  }

  it('CONCLUIDO: solicitante AVALIACAO_PENDENTE, demais STATUS', () => {
    const r = ordenar(destinatarios({ tipo: 'CONCLUIDO', encerrouDireto: false }, ctx()))
    expect(r).toEqual([
      { usuarioId: 1, tipo: 'AVALIACAO_PENDENTE', grupoChave: 'avaliacao:50' },
      { usuarioId: 10, tipo: 'STATUS', grupoChave: 'status:50' },
      { usuarioId: 20, tipo: 'STATUS', grupoChave: 'status:50' },
    ])
  })

  it('CONCLUIDO: AVALIACAO_PENDENTE ignora silenciamento do solicitante', () => {
    const c = ctx({ seguidores: [{ usuarioId: 1, silenciado: true }] })
    expect(destinatarios({ tipo: 'CONCLUIDO', encerrouDireto: false }, c)).toEqual([
      { usuarioId: 1, tipo: 'AVALIACAO_PENDENTE', grupoChave: 'avaliacao:50' },
    ])
  })

  it('CONCLUIDO encerrado direto: solicitante recebe STATUS', () => {
    const r = ordenar(destinatarios({ tipo: 'CONCLUIDO', encerrouDireto: true }, ctx()))
    expect(r.map((d) => [d.usuarioId, d.tipo])).toEqual([
      [1, 'STATUS'],
      [10, 'STATUS'],
      [20, 'STATUS'],
    ])
  })

  for (const tipo of ['APROVADO', 'AUTO_APROVADO'] as const) {
    it(`${tipo}: operador AVALIACAO_RECEBIDA, demais STATUS`, () => {
      const r = ordenar(destinatarios({ tipo, id: 11 }, ctx()))
      expect(r).toEqual([
        { usuarioId: 1, tipo: 'STATUS', grupoChave: 'status:50' },
        { usuarioId: 10, tipo: 'AVALIACAO_RECEBIDA', grupoChave: 'avaliacao-recebida:11' },
        { usuarioId: 20, tipo: 'STATUS', grupoChave: 'status:50' },
      ])
    })
  }

  it('REJEITADO: operador e operadores da área, sem duplicar', () => {
    const r = ordenar(destinatarios({ tipo: 'REJEITADO', id: 12 }, ctx()))
    expect(r).toEqual([
      { usuarioId: 10, tipo: 'REJEITADO', grupoChave: 'rejeitado:12' },
      { usuarioId: 11, tipo: 'REJEITADO', grupoChave: 'rejeitado:12' },
      { usuarioId: 12, tipo: 'REJEITADO', grupoChave: 'rejeitado:12' },
    ])
  })

  for (const tipo of ['PRIORIDADE_ALTERADA', 'CLASSIFICACAO_ALTERADA', 'TAGS_ALTERADAS', 'ANEXO_ADICIONADO'] as const) {
    it(`${tipo}: seguidores não silenciados recebem ATUALIZACAO`, () => {
      const r = ordenar(destinatarios({ tipo }, ctx()))
      expect(r).toEqual([
        { usuarioId: 1, tipo: 'ATUALIZACAO', grupoChave: 'atualizacao:50' },
        { usuarioId: 10, tipo: 'ATUALIZACAO', grupoChave: 'atualizacao:50' },
        { usuarioId: 20, tipo: 'ATUALIZACAO', grupoChave: 'atualizacao:50' },
      ])
    })
  }

  for (const tipo of ['SLA_RISCO', 'SLA_ESTOURADO', 'SLA_RESPOSTA_ESTOURADO'] as const) {
    it(`${tipo}: operador recebe SLA`, () => {
      expect(destinatarios({ tipo, id: 13 }, ctx())).toEqual([{ usuarioId: 10, tipo: 'SLA', grupoChave: 'sla:13' }])
    })
  }

  it('SLA sem operador: operadores da área recebem SLA', () => {
    const c = ctx({ chamado: { id: 50, solicitanteId: 1, operadorId: null, areaId: 7 } })
    expect(ordenar(destinatarios({ tipo: 'SLA_RISCO', id: 14 }, c)).map((d) => d.usuarioId)).toEqual([10, 11, 12])
  })

  it('o ator fica sempre de fora', () => {
    const c = ctx({ ator: 10, mencionados: [20] })
    expect(destinatarios({ tipo: 'COMENTARIO', id: 6 }, c).some((d) => d.usuarioId === 10)).toBe(false)
    expect(destinatarios({ tipo: 'ASSUMIDO', id: 7, operadorNovoId: 10 }, c).some((d) => d.usuarioId === 10)).toBe(
      false,
    )
    expect(
      destinatarios({ tipo: 'CRIADO', id: 5, abertoEmNomeDeOutro: false }, c).some((d) => d.usuarioId === 10),
    ).toBe(false)
  })

  it('prioridade: MENCAO vence COMENTARIO e ATRIBUIDO vence ATUALIZACAO, sem duplicar usuário', () => {
    const r = destinatarios({ tipo: 'ASSUMIDO', id: 7, operadorNovoId: 20 }, ctx())
    expect(r.filter((d) => d.usuarioId === 20)).toEqual([
      { usuarioId: 20, tipo: 'ATRIBUIDO', grupoChave: 'atribuido:7' },
    ])
  })

  it('prioridade: AVALIACAO_PENDENTE vence NOVO_NA_FILA quando o solicitante também é operador', () => {
    const c = ctx({ operadoresDaArea: [1] })
    const r = destinatarios({ tipo: 'CONCLUIDO', encerrouDireto: false }, c)
    expect(r.filter((d) => d.usuarioId === 1)).toEqual([
      { usuarioId: 1, tipo: 'AVALIACAO_PENDENTE', grupoChave: 'avaliacao:50' },
    ])
  })

  it('prioridade: usuário em duas regras aparece uma só vez', () => {
    const c = ctx({ operadoresDaArea: [20], mencionados: [] })
    const r = destinatarios(
      { tipo: 'CRIADO', id: 5, abertoEmNomeDeOutro: true },
      { ...c, chamado: { ...c.chamado, solicitanteId: 20 } },
    )
    expect(r.filter((d) => d.usuarioId === 20)).toHaveLength(1)
  })
})
