import type { AtualizarFeriado, CriarFeriado, ListarFeriadosQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado } from '../../lib/erros'
import { enfileirar } from '../../lib/filas'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { invalidarCalendario } from '../sla/service'
import { selectFeriado } from './schemas'

/** Recorrente é gravado no ano 2000 (bissexto, aceita 29/02): só mês e dia contam. */
const ANO_RECORRENTE = '2000'

/** 'yyyy-MM-dd' → Date em UTC, para o @db.Date. */
function dataParaGravar(data: string, recorrente: boolean): Date {
  const dia = recorrente ? `${ANO_RECORRENTE}${data.slice(4)}` : data
  return new Date(`${dia}T00:00:00Z`)
}

/** @db.Date: nunca usar getters locais; toISOString é independente do fuso. */
function paraResposta<T extends { data: Date }>(linha: T) {
  return { ...linha, data: linha.data.toISOString().slice(0, 10) }
}

/**
 * Chamado depois do commit. `null` = o feriado vale para todas as jornadas: limpa o calendário inteiro e
 * enfileira o recálculo de cada jornada ativa. Jornada específica: só ela.
 */
async function recalcularSla(jornadaIds: (number | null)[]): Promise<void> {
  const alvos = new Set<number>()
  if (jornadaIds.includes(null)) {
    invalidarCalendario()
    const ativas = await prisma.jornada.findMany({
      where: { ativo: true },
      select: { id: true },
      orderBy: { id: 'asc' },
    })
    for (const j of ativas) alvos.add(j.id)
  }
  for (const id of jornadaIds) {
    if (id !== null) {
      invalidarCalendario(id)
      alvos.add(id)
    }
  }
  for (const jornadaId of alvos) await enfileirar('sla-recalcular-jornada', { jornadaId })
}

export async function listarFeriados(q: ListarFeriadosQuery) {
  const where: Prisma.FeriadoWhereInput =
    q.ano === undefined
      ? {}
      : {
          OR: [
            { recorrente: true },
            {
              recorrente: false,
              data: { gte: new Date(Date.UTC(q.ano, 0, 1)), lt: new Date(Date.UTC(q.ano + 1, 0, 1)) },
            },
          ],
        }
  const [itens, total] = await prisma.$transaction([
    prisma.feriado.findMany({
      where,
      select: selectFeriado,
      orderBy: [{ data: 'asc' }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.feriado.count({ where }),
  ])
  return { itens: itens.map(paraResposta), total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterFeriado(id: number) {
  const feriado = await prisma.feriado.findUnique({ where: { id }, select: selectFeriado })
  if (!feriado) throw naoEncontrado('Feriado não encontrado.')
  return paraResposta(feriado)
}

/** Jornada inexistente → P2003 → 422 REFERENCIA_INVALIDA (rollback, nada é auditado). */
export async function criarFeriado(dados: CriarFeriado, ctx: ContextoUsuario) {
  const criado = await prisma.$transaction(async (tx) => {
    const feriado = await tx.feriado.create({
      data: {
        data: dataParaGravar(dados.data, dados.recorrente),
        nome: dados.nome,
        recorrente: dados.recorrente,
        jornadaId: dados.jornadaId,
      },
      select: selectFeriado,
    })
    const resposta = paraResposta(feriado)
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'feriado',
      entidadeId: feriado.id,
      dados: { depois: resposta },
    })
    return resposta
  })
  await recalcularSla([criado.jornadaId])
  return criado
}

/** Troca a jornada do feriado: recalcula a jornada de antes e a de depois. */
export async function atualizarFeriado(id: number, dados: AtualizarFeriado, ctx: ContextoUsuario) {
  const { antes, depois } = await prisma.$transaction(async (tx) => {
    const original = await tx.feriado.findUnique({ where: { id }, select: selectFeriado })
    if (!original) throw naoEncontrado('Feriado não encontrado.')
    const atualizado = await tx.feriado.update({
      where: { id },
      data: {
        data: dataParaGravar(dados.data, dados.recorrente),
        nome: dados.nome,
        recorrente: dados.recorrente,
        jornadaId: dados.jornadaId,
      },
      select: selectFeriado,
    })
    const respostas = { antes: paraResposta(original), depois: paraResposta(atualizado) }
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'feriado',
      entidadeId: id,
      dados: respostas,
    })
    return respostas
  })
  await recalcularSla([antes.jornadaId, depois.jornadaId])
  return depois
}

export async function excluirFeriado(id: number, ctx: ContextoUsuario) {
  const removido = await prisma.$transaction(async (tx) => {
    const original = await tx.feriado.findUnique({ where: { id }, select: selectFeriado })
    if (!original) throw naoEncontrado('Feriado não encontrado.')
    await tx.feriado.delete({ where: { id }, select: selectFeriado })
    const resposta = paraResposta(original)
    await auditar(tx, ctx, {
      acao: 'cadastro.excluido',
      entidade: 'feriado',
      entidadeId: id,
      dados: { antes: resposta },
    })
    return resposta
  })
  await recalcularSla([removido.jornadaId])
}
