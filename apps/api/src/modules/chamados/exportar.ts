import { Readable } from 'node:stream'
import { BOM_CSV, type ChamadoFiltros, linhaCsv } from '@vinimon/shared'
import { DateTime } from 'luxon'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import { obterConfig } from '../../lib/config'
import type { ContextoUsuario } from '../../lib/contexto'
import { prisma } from '../../lib/prisma'
import { whereDaLista } from './consultas'

/** Teto de linhas por exportação (T-5.12): acima disso o CSV sai truncado nas primeiras 5.000 linhas. */
export const LIMITE_EXPORTACAO = 5000
/** Tamanho de cada lote lido por cursor de id. */
export const LOTE_EXPORTACAO = 500

const CABECALHO = [
  'Nº',
  'Assunto',
  'Status',
  'Prioridade',
  'Área',
  'Tipo de problema',
  'Solicitante',
  'Operador',
  'Canal',
  'Abertura',
  'Primeira resposta',
  'Encerramento',
  'Prazo de solução',
  'SLA de solução cumprido',
]

/** Só o que a planilha mostra. Sem descrição, solução, tags, comentários nem contatos. */
const selectExportacao = {
  id: true,
  assunto: true,
  slaSolucaoCumprido: true,
  abertoEm: true,
  primeiraRespostaEm: true,
  concluidoEm: true,
  prazoSolucaoEm: true,
  status: { select: { nome: true } },
  prioridade: { select: { nome: true } },
  area: { select: { nome: true } },
  problema: { select: { nome: true } },
  solicitante: { select: { nome: true } },
  operador: { select: { nome: true } },
  canal: { select: { nome: true } },
} satisfies Prisma.ChamadoSelect

type LinhaExportacao = Prisma.ChamadoGetPayload<{ select: typeof selectExportacao }>

/** Data no fuso do sistema, `dd/MM/yyyy HH:mm`; ausente vira célula vazia. */
const data = (d: Date | null, fuso: string): string =>
  d === null ? '' : DateTime.fromJSDate(d, { zone: fuso }).toFormat('dd/MM/yyyy HH:mm')

const sim = (v: boolean | null): string => (v === null ? '' : v ? 'Sim' : 'Não')

const linhaDe = (c: LinhaExportacao, fuso: string): string =>
  linhaCsv([
    c.id,
    c.assunto,
    c.status.nome,
    c.prioridade.nome,
    c.area.nome,
    c.problema?.nome ?? '',
    c.solicitante?.nome ?? '',
    c.operador?.nome ?? '',
    c.canal.nome,
    data(c.abertoEm, fuso),
    data(c.primeiraRespostaEm, fuso),
    data(c.concluidoEm, fuso),
    data(c.prazoSolucaoEm, fuso),
    sim(c.slaSolucaoCumprido),
  ])

export interface OpcoesExportacao {
  limite?: number
  lote?: number
}

export interface ExportacaoCsv {
  nomeArquivo: string
  fluxo: Readable
}

/**
 * Prepara a exportação da lista. O `where` vem de `whereDaLista` (mesmo escopo e filtros de `listar`, S45), montado
 * aqui antes do stream, então um 403 por filtro (tags) sai como resposta HTTP normal. As linhas são lidas em lotes
 * por cursor de id; a auditoria `exportacao.csv` é gravada no `finally` com as linhas realmente emitidas.
 */
export async function exportarChamados(
  ctx: ContextoUsuario,
  f: ChamadoFiltros,
  agora = new Date(),
  opcoes: OpcoesExportacao = {},
): Promise<ExportacaoCsv> {
  const limite = opcoes.limite ?? LIMITE_EXPORTACAO
  const lote = opcoes.lote ?? LOTE_EXPORTACAO
  const fuso = (await obterConfig())['sistema.fusoHorario']
  const where = whereDaLista(ctx.usuario, f, fuso, agora)
  const nomeArquivo = `chamados-${DateTime.fromJSDate(agora, { zone: fuso }).toFormat('yyyy-MM-dd')}.csv`

  async function* gerar(): AsyncGenerator<string> {
    let emitidas = 0
    let cursor = 0
    try {
      yield BOM_CSV + linhaCsv(CABECALHO)
      while (emitidas < limite) {
        const linhas = await prisma.chamado.findMany({
          where: { AND: [where, { id: { gt: cursor } }] },
          select: selectExportacao,
          orderBy: { id: 'asc' },
          take: Math.min(lote, limite - emitidas),
        })
        const ultimo = linhas.at(-1)
        if (ultimo === undefined) break
        for (const c of linhas) {
          yield linhaDe(c, fuso)
          emitidas += 1
        }
        cursor = ultimo.id
      }
    } finally {
      await prisma.$transaction((tx) =>
        auditar(tx, ctx, { acao: 'exportacao.csv', entidade: 'chamado', dados: { filtros: f, linhas: emitidas } }),
      )
    }
  }

  return { nomeArquivo, fluxo: Readable.from(gerar()) }
}
