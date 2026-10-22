import type { AtualizarPrioridade, CriarPrioridade, ListarPrioridadesQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado, regraNegocio } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { selectPrioridade } from './schemas'

/** Exatamente uma prioridade é padrão: ela não pode ser desmarcada, inativada nem excluída sem outra no lugar. */
const MENSAGEM_PADRAO = 'Defina outra prioridade como padrão.'

export async function listarPrioridades(q: ListarPrioridadesQuery) {
  const where: Prisma.PrioridadeWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const [itens, total] = await prisma.$transaction([
    prisma.prioridade.findMany({
      where,
      select: selectPrioridade,
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.prioridade.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterPrioridade(id: number) {
  const prioridade = await prisma.prioridade.findUnique({ where: { id }, select: selectPrioridade })
  if (!prioridade) throw naoEncontrado('Prioridade não encontrada.')
  return prioridade
}

/** Nome duplicado → P2002 → 409 (rollback). padrao=true desmarca a padrão anterior na mesma transação. */
export function criarPrioridade(dados: CriarPrioridade, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    if (dados.padrao && !dados.ativo) throw regraNegocio(MENSAGEM_PADRAO)
    if (dados.padrao) await tx.prioridade.updateMany({ where: { padrao: true }, data: { padrao: false } })
    const prioridade = await tx.prioridade.create({
      data: {
        nome: dados.nome,
        cor: dados.cor,
        ordem: dados.ordem,
        padrao: dados.padrao,
        slaRespostaMin: dados.slaRespostaMin,
        slaSolucaoMin: dados.slaSolucaoMin,
        ativo: dados.ativo,
      },
      select: selectPrioridade,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'prioridade',
      entidadeId: prioridade.id,
      dados: { depois: prioridade },
    })
    return prioridade
  })
}

/** Desmarcar ou inativar a padrão → 422. Marcar outra como padrão grava padrao=false nas demais. */
export function atualizarPrioridade(id: number, dados: AtualizarPrioridade, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.prioridade.findUnique({ where: { id }, select: selectPrioridade })
    if (!antes) throw naoEncontrado('Prioridade não encontrada.')
    if (antes.padrao && dados.padrao === false) throw regraNegocio(MENSAGEM_PADRAO)
    const seraPadrao = dados.padrao ?? antes.padrao
    const seraAtiva = dados.ativo ?? antes.ativo
    if (seraPadrao && !seraAtiva) throw regraNegocio(MENSAGEM_PADRAO)
    if (dados.padrao === true) {
      await tx.prioridade.updateMany({ where: { padrao: true, id: { not: id } }, data: { padrao: false } })
    }
    const depois = await tx.prioridade.update({
      where: { id },
      data: {
        nome: dados.nome,
        cor: dados.cor,
        ordem: dados.ordem,
        padrao: dados.padrao,
        slaRespostaMin: dados.slaRespostaMin,
        slaSolucaoMin: dados.slaSolucaoMin,
        ativo: dados.ativo,
      },
      select: selectPrioridade,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'prioridade',
      entidadeId: id,
      dados: { antes, depois },
    })
    return depois
  })
}

/** Prioridade padrão não pode ser excluída → 422. Prioridade em uso por chamado → P2003 → 409 REGISTRO_EM_USO (rollback). */
export async function excluirPrioridade(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.prioridade.findUnique({ where: { id }, select: selectPrioridade })
    if (!antes) throw naoEncontrado('Prioridade não encontrada.')
    if (antes.padrao) throw regraNegocio(MENSAGEM_PADRAO)
    await tx.prioridade.delete({ where: { id }, select: selectPrioridade })
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'prioridade', entidadeId: id, dados: { antes } })
  })
}
