import type { AtualizarJornada, CriarJornada, ListarJornadasQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { ErroApp, naoEncontrado } from '../../lib/erros'
import { enfileirar } from '../../lib/filas'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { invalidarCalendario } from '../sla/service'
import { selectJornada } from './schemas'

const MENSAGEM_EM_USO = 'Jornada em uso por áreas, chamados ou pela jornada padrão do SLA.'

export async function listarJornadas(q: ListarJornadasQuery) {
  const where: Prisma.JornadaWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const [itens, total] = await prisma.$transaction([
    prisma.jornada.findMany({
      where,
      select: selectJornada,
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.jornada.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterJornada(id: number) {
  const jornada = await prisma.jornada.findUnique({ where: { id }, select: selectJornada })
  if (!jornada) throw naoEncontrado('Jornada não encontrada.')
  return jornada
}

/** Nome duplicado → P2002 → 409. Os horários entram na mesma transação da jornada. */
export function criarJornada(dados: CriarJornada, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const jornada = await tx.jornada.create({
      data: {
        nome: dados.nome,
        timezone: dados.timezone,
        ininterrupta: dados.ininterrupta,
        ativo: dados.ativo,
        horarios: { create: dados.horarios },
      },
      select: selectJornada,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'jornada',
      entidadeId: jornada.id,
      dados: { depois: jornada },
    })
    return jornada
  })
}

/**
 * Troca todos os horários na mesma transação. Depois do commit: invalida o calendário em cache e enfileira o
 * recálculo do SLA dos chamados em aberto desta jornada.
 */
export async function atualizarJornada(id: number, dados: AtualizarJornada, ctx: ContextoUsuario) {
  const depois = await prisma.$transaction(async (tx) => {
    const antes = await tx.jornada.findUnique({ where: { id }, select: selectJornada })
    if (!antes) throw naoEncontrado('Jornada não encontrada.')
    await tx.jornadaHorario.deleteMany({ where: { jornadaId: id } })
    const atualizada = await tx.jornada.update({
      where: { id },
      data: {
        nome: dados.nome,
        timezone: dados.timezone,
        ininterrupta: dados.ininterrupta,
        ativo: dados.ativo,
        horarios: { create: dados.horarios },
      },
      select: selectJornada,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'jornada',
      entidadeId: id,
      dados: { antes, depois: atualizada },
    })
    return atualizada
  })
  // Efeitos fora da transação: só depois do commit.
  invalidarCalendario(id)
  await enfileirar('sla-recalcular-jornada', { jornadaId: id })
  return depois
}

/**
 * Em uso → 409 REGISTRO_EM_USO (rollback, nada é auditado). Área, chamado e a FK Restrict são pegos pelo P2003;
 * `sla.jornadaPadraoId` é chave JSON da tabela config, sem FK, então é conferido aqui.
 */
export async function excluirJornada(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.jornada.findUnique({ where: { id }, select: selectJornada })
    if (!antes) throw naoEncontrado('Jornada não encontrada.')
    const padrao = await tx.config.findUnique({ where: { chave: 'sla.jornadaPadraoId' }, select: { valor: true } })
    if (padrao?.valor === id) throw new ErroApp(409, 'REGISTRO_EM_USO', MENSAGEM_EM_USO)
    await tx.jornada.delete({ where: { id }, select: selectJornada })
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'jornada', entidadeId: id, dados: { antes } })
  })
  invalidarCalendario(id)
}
