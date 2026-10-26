import { type ChamadoEvento, NOTAS_AVALIACAO, type NotaAvaliacao, type TipoEvento } from '@vinimon/shared'
import { formatarDataHora } from '@/lib/datas'
import { ROTULOS_NOTA_AVALIACAO } from '@/lib/rotulos'

type Dados = ChamadoEvento['dados']

/** Nome de uma referência `{ id, nome }` ou um texto já pronto; qualquer outra forma vira null. */
function nomeDe(valor: unknown): string | null {
  if (typeof valor === 'string' && valor.trim() !== '') return valor
  if (valor !== null && typeof valor === 'object' && 'nome' in valor && typeof valor.nome === 'string') {
    return valor.nome
  }
  return null
}

function listaDe(valor: unknown): string {
  if (!Array.isArray(valor)) return 'nenhuma'
  const nomes = valor.filter((item): item is string => typeof item === 'string')
  return nomes.length > 0 ? nomes.join(', ') : 'nenhuma'
}

function ehNota(valor: unknown): valor is NotaAvaliacao {
  return NOTAS_AVALIACAO.some((nota) => nota === valor)
}

function dataDe(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? null : formatarDataHora(data)
}

/** Troca de `de` para `para` com nomes; sem nome conhecido cai para um traço. */
function deParaDe(dados: Dados, rotulo: string): string {
  return `${rotulo} de ${nomeDe(dados.de) ?? '—'} para ${nomeDe(dados.para) ?? '—'}`
}

const TEXTO_POR_TIPO: Record<TipoEvento, (dados: Dados) => string> = {
  CRIADO: () => 'Chamado aberto',
  COMENTARIO: () => 'Comentário publicado',
  ASSUMIDO: () => 'Chamado assumido',
  ENCAMINHADO: (dados) => {
    const operador = nomeDe(dados.operador)
    const destino = `Encaminhado de ${nomeDe(dados.deArea) ?? '—'} para ${nomeDe(dados.paraArea) ?? '—'}`
    return operador ? `${destino}, com ${operador}` : destino
  },
  STATUS_ALTERADO: (dados) => deParaDe(dados, 'Status alterado'),
  PRIORIDADE_ALTERADA: (dados) => deParaDe(dados, 'Prioridade alterada'),
  CLASSIFICACAO_ALTERADA: () => 'Classificação alterada',
  TAGS_ALTERADAS: (dados) => `Tags alteradas: ${listaDe(dados.de)} → ${listaDe(dados.para)}`,
  AGENDADO: (dados) => {
    const quando = dataDe(dados.para)
    return quando ? `Agendado para ${quando}` : 'Chamado agendado'
  },
  RETORNO_AGENDAMENTO: () => 'Retorno do agendamento',
  CONCLUIDO: (dados) =>
    dados.direto === true
      ? 'Chamado concluído sem validação do solicitante'
      : 'Chamado concluído, aguardando validação do solicitante',
  APROVADO: (dados) =>
    ehNota(dados.nota)
      ? `Atendimento aprovado pelo solicitante (${ROTULOS_NOTA_AVALIACAO[dados.nota]})`
      : 'Atendimento aprovado pelo solicitante',
  REJEITADO: () => 'Atendimento rejeitado pelo solicitante',
  AUTO_APROVADO: () => 'Aprovado automaticamente após o prazo de validação',
  SOLICITADO_RETORNO: () => 'Retorno solicitado ao solicitante',
  AUTO_ENCERRADO: () => 'Encerrado automaticamente por inatividade',
  REABERTO: () => 'Chamado reaberto',
  CANCELADO: () => 'Chamado cancelado',
  ANEXO_ADICIONADO: () => 'Anexo adicionado',
  ANEXO_REMOVIDO: () => 'Anexo removido',
  SLA_RISCO: () => 'SLA de solução em risco',
  SLA_ESTOURADO: () => 'SLA de solução estourado',
  SLA_RESPOSTA_ESTOURADO: () => 'SLA de resposta estourado',
  AUXILIAR_ADICIONADO: (dados) =>
    `Operador auxiliar adicionado${nomeDe(dados.auxiliar) ? `: ${nomeDe(dados.auxiliar)}` : ''}`,
  AUXILIAR_REMOVIDO: (dados) =>
    `Operador auxiliar removido${nomeDe(dados.auxiliar) ? `: ${nomeDe(dados.auxiliar)}` : ''}`,
}

/** Texto em pt-BR de um evento do histórico, montado a partir de `dados` (sem HTML). */
export function textoEvento(evento: Pick<ChamadoEvento, 'tipo' | 'dados'>): string {
  return TEXTO_POR_TIPO[evento.tipo](evento.dados)
}
