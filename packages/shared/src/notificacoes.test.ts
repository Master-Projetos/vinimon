import { describe, expect, it } from 'vitest'
import { TIPOS_NOTIFICACAO, type TipoNotificacao } from './enums'
import {
  type NotificacaoDTO,
  NotificacaoDTOSchema,
  preferenciaEfetiva,
  preferenciaPadrao,
  TIPOS_INAPP_FIXOS,
  textoNotificacao,
} from './notificacoes'
import { PERFIS } from './permissoes'

const ana = { id: 1, nome: 'Ana Souza' }
const joao = { id: 2, nome: 'João Lima' }
const bia = { id: 3, nome: 'Bia Costa' }
const caio = { id: 4, nome: 'Caio Dias' }

function n(
  extra: Partial<NotificacaoDTO> = {},
): Pick<NotificacaoDTO, 'tipo' | 'chamado' | 'atores' | 'contagem' | 'dados'> {
  return {
    tipo: 'COMENTARIO',
    chamado: { id: 123, assunto: 'Impressora' },
    atores: [ana],
    contagem: 1,
    dados: {},
    ...extra,
  }
}

describe('TIPOS_INAPP_FIXOS e preferenciaPadrao', () => {
  it('lista os três tipos fixos', () => {
    expect([...TIPOS_INAPP_FIXOS]).toEqual(['MENCAO', 'ATRIBUIDO', 'AVALIACAO_PENDENTE'])
  })

  const esperado: Record<TipoNotificacao, { inapp: boolean; desktop: boolean; fixo: boolean }> = {
    MENCAO: { inapp: true, desktop: true, fixo: true },
    ATRIBUIDO: { inapp: true, desktop: true, fixo: true },
    AVALIACAO_PENDENTE: { inapp: true, desktop: true, fixo: true },
    NOVO_NA_FILA: { inapp: true, desktop: true, fixo: false },
    COMENTARIO: { inapp: true, desktop: true, fixo: false },
    SLA: { inapp: true, desktop: true, fixo: false },
    REJEITADO: { inapp: true, desktop: true, fixo: false },
    STATUS: { inapp: true, desktop: false, fixo: false },
    ATUALIZACAO: { inapp: true, desktop: false, fixo: false },
    AVALIACAO_RECEBIDA: { inapp: true, desktop: false, fixo: false },
  }

  for (const tipo of TIPOS_NOTIFICACAO) {
    it(`padrão de ${tipo}`, () => {
      for (const perfil of PERFIS) expect(preferenciaPadrao(tipo, perfil)).toEqual(esperado[tipo])
    })
  }
})

describe('preferenciaEfetiva', () => {
  it('desligar o in-app desliga o desktop', () => {
    expect(preferenciaEfetiva('COMENTARIO', { inapp: false, desktop: true })).toEqual({ inapp: false, desktop: false })
  })
  it('mantém as duas ligadas', () => {
    expect(preferenciaEfetiva('COMENTARIO', { inapp: true, desktop: true })).toEqual({ inapp: true, desktop: true })
  })
  it('tipo fixo nunca desliga o in-app', () => {
    expect(preferenciaEfetiva('MENCAO', { inapp: false, desktop: true })).toEqual({ inapp: true, desktop: true })
  })
})

describe('textoNotificacao', () => {
  it('MENCAO', () => {
    expect(textoNotificacao(n({ tipo: 'MENCAO' }))).toBe('Ana Souza mencionou você em #123')
    expect(textoNotificacao(n({ tipo: 'MENCAO', atores: [ana, joao] }))).toBe('Ana e João mencionaram você em #123')
  })
  it('COMENTARIO com 1 ator', () => {
    expect(textoNotificacao(n())).toBe('Ana Souza comentou em #123')
  })
  it('COMENTARIO com 2 atores', () => {
    expect(textoNotificacao(n({ atores: [ana, joao], contagem: 2 }))).toBe('Ana e João comentaram em #123')
  })
  it('COMENTARIO com 3+ atores', () => {
    expect(textoNotificacao(n({ atores: [ana, joao, bia], contagem: 3 }))).toBe(
      'Ana e mais 2 pessoas comentaram em #123',
    )
    expect(textoNotificacao(n({ atores: [ana, joao, bia, caio], contagem: 4 }))).toBe(
      'Ana e mais 3 pessoas comentaram em #123',
    )
  })
  it('COMENTARIO com contagem > 1 de um só ator', () => {
    expect(textoNotificacao(n({ contagem: 3 }))).toBe('Ana Souza adicionou 3 comentários em #123')
  })
  it('COMENTARIO sem ator', () => {
    expect(textoNotificacao(n({ atores: [] }))).toBe('Alguém comentou em #123')
  })
  it('STATUS', () => {
    const d = { statusNome: 'Encerrado' }
    expect(textoNotificacao(n({ tipo: 'STATUS', dados: d }))).toBe('Ana Souza alterou o status de #123 para Encerrado')
    expect(textoNotificacao(n({ tipo: 'STATUS', dados: d, atores: [ana, joao] }))).toBe(
      'Ana e João alteraram o status de #123 para Encerrado',
    )
    expect(textoNotificacao(n({ tipo: 'STATUS', dados: d, atores: [ana, joao, bia] }))).toBe(
      'Ana e mais 2 pessoas alteraram o status de #123 para Encerrado',
    )
    expect(textoNotificacao(n({ tipo: 'STATUS', dados: {} }))).toBe('Ana Souza alterou o status de #123')
    expect(textoNotificacao(n({ tipo: 'STATUS', dados: d, atores: [] }))).toBe('#123 mudou para Encerrado')
    expect(textoNotificacao(n({ tipo: 'STATUS', dados: null, atores: [] }))).toBe('O status de #123 foi alterado')
  })
  it('NOVO_NA_FILA', () => {
    expect(textoNotificacao(n({ tipo: 'NOVO_NA_FILA', dados: { areaNome: 'TI' } }))).toBe(
      'Novo chamado #123 na fila de TI',
    )
    expect(textoNotificacao(n({ tipo: 'NOVO_NA_FILA', dados: null }))).toBe('Novo chamado #123 na fila')
  })
  it('SLA', () => {
    const prazoEm = new Date('2026-03-10T17:30:00.000Z')
    expect(textoNotificacao(n({ tipo: 'SLA', dados: { marco: 'RISCO', prazoEm } }))).toBe(
      'O prazo de solução de #123 vence às 14:30',
    )
    expect(textoNotificacao(n({ tipo: 'SLA', dados: { prazoEm } }), 'UTC')).toBe(
      'O prazo de solução de #123 vence às 17:30',
    )
    expect(textoNotificacao(n({ tipo: 'SLA', dados: { marco: 'RISCO' } }))).toBe(
      'O prazo de solução de #123 vence em breve',
    )
    expect(textoNotificacao(n({ tipo: 'SLA', dados: { marco: 'ESTOURADO' } }))).toBe(
      'O prazo de solução de #123 venceu',
    )
    expect(textoNotificacao(n({ tipo: 'SLA', dados: { marco: 'RESPOSTA_ESTOURADO' } }))).toBe(
      'O prazo de resposta de #123 venceu',
    )
  })
  it('AVALIACAO_PENDENTE', () => {
    expect(textoNotificacao(n({ tipo: 'AVALIACAO_PENDENTE', atores: [] }))).toBe(
      '#123 foi encerrado. Confirme a solução e avalie o atendimento.',
    )
  })
  it('ATRIBUIDO', () => {
    expect(textoNotificacao(n({ tipo: 'ATRIBUIDO' }))).toBe('Ana Souza atribuiu #123 a você')
    expect(textoNotificacao(n({ tipo: 'ATRIBUIDO', atores: [ana, joao] }))).toBe('Ana e João atribuíram #123 a você')
  })
  it('ATUALIZACAO', () => {
    expect(textoNotificacao(n({ tipo: 'ATUALIZACAO' }))).toBe('Ana Souza atualizou #123')
    expect(textoNotificacao(n({ tipo: 'ATUALIZACAO', atores: [ana, joao] }))).toBe('Ana e João atualizaram #123')
    expect(textoNotificacao(n({ tipo: 'ATUALIZACAO', atores: [] }))).toBe('#123 foi atualizado')
  })
  it('AVALIACAO_RECEBIDA', () => {
    expect(textoNotificacao(n({ tipo: 'AVALIACAO_RECEBIDA' }))).toBe('Ana Souza avaliou o atendimento de #123')
    expect(textoNotificacao(n({ tipo: 'AVALIACAO_RECEBIDA', atores: [ana, joao] }))).toBe(
      'Ana e João avaliaram o atendimento de #123',
    )
  })
  it('REJEITADO', () => {
    expect(textoNotificacao(n({ tipo: 'REJEITADO' }))).toBe('Ana Souza rejeitou a solução de #123')
    expect(textoNotificacao(n({ tipo: 'REJEITADO', atores: [ana, joao] }))).toBe(
      'Ana e João rejeitaram a solução de #123',
    )
    expect(textoNotificacao(n({ tipo: 'REJEITADO', atores: [] }))).toBe('A solução de #123 foi rejeitada')
  })
})

describe('NotificacaoDTOSchema', () => {
  const valido = {
    id: 1,
    tipo: 'COMENTARIO',
    chamado: { id: 123, assunto: 'Impressora' },
    atores: [{ id: 1, nome: 'Ana Souza' }],
    contagem: 1,
    interno: false,
    trecho: null,
    assentamentoId: 10,
    dados: { areaNome: 'TI', prazoEm: '2026-03-10T17:30:00.000Z' },
    criadoEm: '2026-03-10T12:00:00.000Z',
    atualizadoEm: '2026-03-10T12:00:00.000Z',
    lida: false,
  }

  it('aceita um DTO válido e converte datas', () => {
    const r = NotificacaoDTOSchema.parse(valido)
    expect(r.criadoEm).toBeInstanceOf(Date)
    expect(r.dados?.prazoEm).toBeInstanceOf(Date)
  })
  it('rejeita chave extra na raiz', () => {
    expect(NotificacaoDTOSchema.safeParse({ ...valido, extra: 1 }).success).toBe(false)
  })
  it('rejeita chave extra em dados', () => {
    expect(NotificacaoDTOSchema.safeParse({ ...valido, dados: { texto: 'x' } }).success).toBe(false)
  })
  it('rejeita tipo desconhecido', () => {
    expect(NotificacaoDTOSchema.safeParse({ ...valido, tipo: 'OUTRO' }).success).toBe(false)
  })
})
