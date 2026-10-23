import { linhaCsv, type Relatorio } from '@vinimon/shared'

const num = (v: number | null): string => (v === null ? '' : String(v).replace('.', ','))

/** Linhas do CSV (sem BOM) de qualquer um dos 8 tipos; toda célula passa por `linhaCsv` (S82). */
export function linhasDoCsv(r: Relatorio): string[] {
  const periodo = linhaCsv(['Período', r.de, r.ate])
  const padrao = (): string[] => [
    linhaCsv(['Nome', 'Total', 'Encerrados', '% no prazo de solução', 'Tempo médio de solução útil (min)']),
    ...r.linhas.map((l) =>
      linhaCsv([l.nome, l.total, l.encerrados, num(l.pctNoPrazo), num(l.tempoMedioSolucaoUtilMin)]),
    ),
  ]
  if (r.tipo === 'sla' && r.sla !== undefined) {
    const secao = (titulo: string, linhas: NonNullable<Relatorio['sla']>['porArea']) => [
      linhaCsv([
        titulo,
        'Total',
        'Com meta de resposta',
        '% resposta no prazo',
        'Com meta de solução',
        '% solução no prazo',
      ]),
      ...linhas.map((l) =>
        linhaCsv([
          l.nome,
          l.total,
          l.comMetaResposta,
          num(l.pctRespostaNoPrazo),
          l.comMetaSolucao,
          num(l.pctSolucaoNoPrazo),
        ]),
      ),
    ]
    return [periodo, ...secao('Área', r.sla.porArea), ...secao('Tipo de problema', r.sla.porProblema)]
  }
  if (r.tipo === 'avaliacoes' && r.avaliacoes !== undefined) {
    const a = r.avaliacoes
    return [
      periodo,
      linhaCsv(['Nota', 'Total']),
      ...a.distribuicao.map((d) => linhaCsv([d.nota, d.total])),
      linhaCsv(['Avaliadas', a.avaliadas]),
      linhaCsv(['% automáticas', num(a.pctAutomaticas)]),
      linhaCsv(['Média geral', num(a.mediaGeral)]),
      linhaCsv(['Operador', 'Avaliadas', 'Média']),
      ...a.mediaPorOperador.map((m) => linhaCsv([m.nome, m.avaliadas, num(m.media)])),
    ]
  }
  return [periodo, ...padrao()]
}
