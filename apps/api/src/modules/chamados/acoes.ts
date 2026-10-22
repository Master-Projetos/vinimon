import {
  type AssumirChamado,
  type ChamadoDetalhe,
  type EncaminharChamado,
  type PrioridadeChamadoBody,
  type StatusChamadoBody,
  type TipoStatus,
  temPermissao,
} from '@vinimon/shared'
import { acoesDoUsuario, type ChamadoParaAcoes, podeVerChamado } from '../../autorizacao/chamados'
import type { Prisma } from '../../generated/prisma/client'
import { obterConfig } from '../../lib/config'
import type { ContextoUsuario } from '../../lib/contexto'
import { conflito, ErroApp, naoEncontrado, regraNegocio, semPermissao } from '../../lib/erros'
import { prisma, type Tx } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'
import { tempoReal } from '../../lib/tempo-real'
import { aplicarTransicaoStatus, recalcularChamado, snapshotSla } from '../sla/service'
import { aposCommitChamado, type EfeitosChamado, type LogErro, registrarEvento, registrarSistema } from './eventos'
import { montarDetalhe } from './service'

const MSG_VERSAO = 'O chamado foi alterado por outra pessoa. Recarregue.'
const EM_CURSO: readonly TipoStatus[] = ['ABERTO', 'EM_ATENDIMENTO', 'PENDENTE']

const selectParaAcao = {
  id: true,
  areaId: true,
  operadorId: true,
  solicitanteId: true,
  statusId: true,
  statusTipo: true,
  cancelado: true,
  encerradoEm: true,
  versao: true,
  primeiraRespostaEm: true,
  problemaId: true,
  prioridadeId: true,
  status: { select: { nome: true, papel: true } },
  area: { select: { nome: true } },
  operador: { select: { nome: true } },
  prioridade: { select: { nome: true } },
} satisfies Prisma.ChamadoSelect

type ChamadoCarregado = NonNullable<Awaited<ReturnType<typeof carregarParaAcao>>>

/** Passo 1 do padrão de ação: carrega o que as regras precisam. Inexistente dá 404. */
async function carregarParaAcao(tx: Tx, id: number) {
  return tx.chamado.findUnique({ where: { id }, select: selectParaAcao })
}

/**
 * Passos 2 e 3: escopo (fora dele é 404, igual a inexistente, S46) e `acoesDoUsuario[acao]` (403 quando a ação não
 * serve ao usuário ou ao tipo de status atual). Ordem de S47: permissão da rota, escopo, estado, versão.
 */
async function exigirAcao(
  tx: Tx,
  u: UsuarioSessao,
  id: number,
  acao: 'assumir' | 'encaminhar' | 'status' | 'prioridade',
  agora: Date,
): Promise<ChamadoCarregado> {
  const c = await carregarParaAcao(tx, id)
  if (!c || !podeVerChamado(u, c)) throw naoEncontrado('Chamado não encontrado.')
  const paraAcoes: ChamadoParaAcoes = { ...c, papel: c.status.papel }
  if (!acoesDoUsuario(u, paraAcoes, await obterConfig(), agora)[acao]) {
    throw semPermissao('Esta ação não está disponível para o chamado neste momento.')
  }
  return c
}

/**
 * Primeira resposta (C11): gravada uma única vez, por quem tem `chamado.atender` e não é o solicitante. Quem chama
 * recalcula o SLA em seguida (o `recalcularChamado` de cada ação já faz isso).
 */
async function marcarPrimeiraResposta(
  tx: Tx,
  c: Pick<ChamadoCarregado, 'id' | 'primeiraRespostaEm' | 'solicitanteId'>,
  ator: UsuarioSessao,
  agora: Date,
): Promise<boolean> {
  if (c.primeiraRespostaEm !== null || c.solicitanteId === ator.id || !temPermissao(ator.perfil, 'chamado.atender'))
    return false
  await tx.chamado.update({ where: { id: c.id }, data: { primeiraRespostaEm: agora } })
  return true
}

/** Lock otimista para ações que não passam por `aplicarTransicaoStatus`. */
async function atualizarComVersao(
  tx: Tx,
  id: number,
  versao: number,
  data: Prisma.ChamadoUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.chamado.updateMany({ where: { id, versao }, data: { ...data, versao: { increment: 1 } } })
  if (count === 0) throw conflito(MSG_VERSAO)
}

async function statusDoPapel(tx: Tx, papel: 'INICIAL' | 'EM_ATENDIMENTO' | 'ENCAMINHADO'): Promise<number> {
  const s = await tx.status.findFirst({ where: { papel, ativo: true }, select: { id: true } })
  if (!s) throw regraNegocio(`Não há status configurado para o papel ${papel}.`)
  return s.id
}

/** Comentário público opcional que acompanha a ação (sem menções: o `comentar` completo é da T-6.3). */
async function comentarioOpcional(
  tx: Tx,
  chamadoId: number,
  autor: UsuarioSessao,
  texto: string | undefined,
): Promise<number[]> {
  if (texto === undefined) return []
  const a = await tx.assentamento.create({
    data: { chamadoId, autorId: autor.id, tipo: 'COMENTARIO', interno: false, texto },
    select: { id: true },
  })
  return [a.id]
}

async function seguirComo(tx: Tx, chamadoId: number, usuarioId: number, motivo: 'ATRIBUIDO'): Promise<void> {
  await tx.chamadoSeguidor.createMany({ data: [{ chamadoId, usuarioId, motivo }], skipDuplicates: true })
}

type Resultado = { chamadoId: number; efeitos: EfeitosChamado }

async function concluirAcao(u: UsuarioSessao, r: Resultado, agora: Date, log?: LogErro): Promise<ChamadoDetalhe> {
  await aposCommitChamado({ chamadoId: r.chamadoId, ...r.efeitos, ...(log ? { log } : {}) })
  return montarDetalhe(u, r.chamadoId, agora)
}

// ───────── assumir ─────────

/**
 * `assumir`: `operadorId = eu`. Em ABERTO vai para o papel EM_ATENDIMENTO. Com outro responsável, exige
 * `confirmarTroca: true` (senão 409). Marca a primeira resposta. O aviso ao responsável anterior sai pelo fanout (T-6.8).
 */
export async function assumir(
  id: number,
  dados: AssumirChamado,
  ctx: ContextoUsuario,
  log?: LogErro,
): Promise<ChamadoDetalhe> {
  const u = ctx.usuario
  const agora = new Date()
  const r = await prisma.$transaction(async (tx): Promise<Resultado> => {
    const c = await exigirAcao(tx, u, id, 'assumir', agora)
    if (c.versao !== dados.versao) throw conflito(MSG_VERSAO)
    const anterior = c.operadorId
    if (anterior !== null && anterior !== u.id && dados.confirmarTroca !== true) {
      throw new ErroApp(
        409,
        'CONFLITO',
        `Este chamado já está com ${c.operador?.nome ?? 'outro responsável'}. Confirme a troca para assumir.`,
      )
    }
    if (c.statusTipo === 'ABERTO') {
      await aplicarTransicaoStatus(tx, {
        chamadoId: id,
        versao: dados.versao,
        novoStatusId: await statusDoPapel(tx, 'EM_ATENDIMENTO'),
        atorId: u.id,
        agora,
        extras: { operadorId: u.id },
      })
    } else {
      await atualizarComVersao(tx, id, dados.versao, { operadorId: u.id })
    }
    await seguirComo(tx, id, u.id, 'ATRIBUIDO')
    await marcarPrimeiraResposta(tx, c, u, agora)
    await recalcularChamado(tx, id, agora)

    const texto =
      anterior !== null && anterior !== u.id
        ? `Chamado assumido por ${u.nome} (antes com ${c.operador?.nome ?? 'outro responsável'})`
        : `Chamado assumido por ${u.nome}`
    const sistema = await registrarSistema(tx, id, 'ASSUMIDO', texto, { de: anterior, para: u.id })
    const evento = await registrarEvento(tx, {
      chamadoId: id,
      tipo: 'ASSUMIDO',
      atorId: u.id,
      assentamentoId: sistema,
      dados: { de: anterior, para: u.id },
    })
    const comentario = await comentarioOpcional(tx, id, u, dados.comentario)
    return {
      chamadoId: id,
      efeitos: {
        eventoIds: [evento],
        assentamentoIds: [sistema, ...comentario],
        campos: ['operador', 'status'],
        acessoMudou: false,
        fila: 'atribuido',
      },
    }
  })
  return concluirAcao(u, r, agora, log)
}

// ───────── encaminhar ─────────

/** Candidatos com notificação aberta no chamado e que deixam de vê-lo depois do encaminhamento (em memória, S53). */
async function quemPerdeuAcesso(
  tx: Tx,
  chamadoId: number,
  novoEscopo: { areaId: number; operadorId: number | null; solicitanteId: number },
): Promise<number[]> {
  const pendentes = await tx.notificacao.findMany({
    where: { chamadoId, lidaEm: null },
    select: { usuarioId: true },
    distinct: ['usuarioId'],
  })
  if (pendentes.length === 0) return []
  const usuarios = await tx.usuario.findMany({
    where: { id: { in: pendentes.map((p) => p.usuarioId) } },
    select: {
      id: true,
      nome: true,
      login: true,
      perfil: true,
      areaId: true,
      areasSecundarias: { select: { areaId: true } },
    },
  })
  return usuarios
    .filter((x) => {
      const areaIds = [...(x.areaId === null ? [] : [x.areaId]), ...x.areasSecundarias.map((a) => a.areaId)]
      const candidato: UsuarioSessao = {
        id: x.id,
        nome: x.nome,
        login: x.login,
        perfil: x.perfil,
        areaId: x.areaId,
        areaIds,
        sessaoId: '',
        estado: 'ATIVA',
        mfaAtivo: false,
      }
      return !podeVerChamado(candidato, novoEscopo)
    })
    .map((x) => x.id)
}

/**
 * `encaminhar`: área destino ativa que atende; operador destino opcional (ativo, OPERADOR ou ADMIN, com a área entre as
 * dele). Com operador vai para o papel ENCAMINHADO; sem, para INICIAL com `operadorId = null`. Recalcula jornada e SLA
 * pela área nova. A primeira resposta segue `chamado.primeiraRespostaAoEncaminhar`.
 */
export async function encaminhar(
  id: number,
  dados: EncaminharChamado,
  ctx: ContextoUsuario,
  log?: LogErro,
): Promise<ChamadoDetalhe> {
  const u = ctx.usuario
  const agora = new Date()
  const cfg = await obterConfig()
  const r = await prisma.$transaction(async (tx): Promise<Resultado & { perderamAcesso: number[] }> => {
    const c = await exigirAcao(tx, u, id, 'encaminhar', agora)
    if (c.versao !== dados.versao) throw conflito(MSG_VERSAO)

    const destino = await tx.area.findFirst({
      where: { id: dados.areaId, ativo: true, atende: true },
      select: { id: true, nome: true },
    })
    if (!destino) throw regraNegocio('A área de destino não existe, está inativa ou não atende chamados.')
    let operador: { id: number; nome: string } | null = null
    if (dados.operadorId !== undefined) {
      const o = await tx.usuario.findFirst({
        where: { id: dados.operadorId, ativo: true, perfil: { in: ['OPERADOR', 'ADMIN'] } },
        select: { id: true, nome: true, perfil: true, areaId: true, areasSecundarias: { select: { areaId: true } } },
      })
      if (!o) throw regraNegocio('O operador de destino não existe, está inativo ou não atende chamados.')
      const areasDele = [...(o.areaId === null ? [] : [o.areaId]), ...o.areasSecundarias.map((a) => a.areaId)]
      if (o.perfil !== 'ADMIN' && !areasDele.includes(destino.id))
        throw regraNegocio('A área de destino não está entre as áreas do operador.')
      operador = { id: o.id, nome: o.nome }
    }

    const sla = await snapshotSla(tx, { problemaId: c.problemaId, prioridadeId: c.prioridadeId, areaId: destino.id })
    const novoStatusId = await statusDoPapel(tx, operador ? 'ENCAMINHADO' : 'INICIAL')
    await aplicarTransicaoStatus(tx, {
      chamadoId: id,
      versao: dados.versao,
      novoStatusId,
      atorId: u.id,
      agora,
      extras: {
        areaId: destino.id,
        operadorId: operador?.id ?? null,
        jornadaId: sla.jornadaId,
        slaRespostaMin: sla.slaRespostaMin,
        slaSolucaoMin: sla.slaSolucaoMin,
      },
    })
    if (operador) await seguirComo(tx, id, operador.id, 'ATRIBUIDO')

    const marcar =
      cfg['chamado.primeiraRespostaAoEncaminhar'] === 'SEMPRE' ||
      (cfg['chamado.primeiraRespostaAoEncaminhar'] === 'ESCOLHA' && dados.marcarPrimeiraResposta !== false)
    if (marcar) await marcarPrimeiraResposta(tx, c, u, agora)
    await recalcularChamado(tx, id, agora)

    const texto = `Encaminhado de ${c.area.nome} para ${destino.nome}${operador ? ` (responsável: ${operador.nome})` : ''}`
    const dadosEvento = {
      deArea: { id: c.areaId, nome: c.area.nome },
      paraArea: { id: destino.id, nome: destino.nome },
      operador,
    }
    const sistema = await registrarSistema(tx, id, 'ENCAMINHADO', texto, dadosEvento)
    const evento = await registrarEvento(tx, {
      chamadoId: id,
      tipo: 'ENCAMINHADO',
      atorId: u.id,
      assentamentoId: sistema,
      dados: dadosEvento,
    })
    const comentario = await comentarioOpcional(tx, id, u, dados.comentario)
    const perderamAcesso = await quemPerdeuAcesso(tx, id, {
      areaId: destino.id,
      operadorId: operador?.id ?? null,
      solicitanteId: c.solicitanteId,
    })
    return {
      chamadoId: id,
      perderamAcesso,
      efeitos: {
        eventoIds: [evento],
        assentamentoIds: [sistema, ...comentario],
        campos: ['area', 'operador', 'status'],
        acessoMudou: true,
        fila: 'encaminhado',
      },
    }
  })

  // depois do commit: quem perdeu o acesso tem as notificações do chamado marcadas como lidas e a contagem reemitida
  if (r.perderamAcesso.length > 0) {
    try {
      await prisma.notificacao.updateMany({
        where: { chamadoId: id, usuarioId: { in: r.perderamAcesso }, lidaEm: null },
        data: { lidaEm: agora },
      })
      for (const usuarioId of r.perderamAcesso) {
        tempoReal.emitirContagem(usuarioId, await prisma.notificacao.count({ where: { usuarioId, lidaEm: null } }))
      }
    } catch (err) {
      log?.error({ err, chamadoId: id }, 'falha ao limpar notificações de quem perdeu o acesso')
    }
  }
  return concluirAcao(u, r, agora, log)
}

// ───────── status ─────────

/** Status de destino de uma troca manual: só tipos em curso. AGENDADO, CONCLUIDO e ENCERRADO têm ação própria. */
export async function trocarStatus(
  id: number,
  dados: StatusChamadoBody,
  ctx: ContextoUsuario,
  log?: LogErro,
): Promise<ChamadoDetalhe> {
  const u = ctx.usuario
  const agora = new Date()
  const r = await prisma.$transaction(async (tx): Promise<Resultado> => {
    const c = await exigirAcao(tx, u, id, 'status', agora)
    if (c.versao !== dados.versao) throw conflito(MSG_VERSAO)
    const novo = await tx.status.findFirst({
      where: { id: dados.statusId, ativo: true },
      select: { id: true, nome: true, tipo: true },
    })
    if (!novo) throw regraNegocio('Status inexistente ou inativo.')
    if (!EM_CURSO.includes(novo.tipo)) throw regraNegocio('Agendar, concluir e encerrar têm ações próprias.')
    if (novo.id === c.statusId) throw regraNegocio('O chamado já está com esse status.')

    await aplicarTransicaoStatus(tx, {
      chamadoId: id,
      versao: dados.versao,
      novoStatusId: novo.id,
      atorId: u.id,
      agora,
    })
    await marcarPrimeiraResposta(tx, c, u, agora)
    await recalcularChamado(tx, id, agora)

    const dadosEvento = { de: { id: c.statusId, nome: c.status.nome }, para: { id: novo.id, nome: novo.nome } }
    const sistema = await registrarSistema(
      tx,
      id,
      'STATUS_ALTERADO',
      `Status alterado de ${c.status.nome} para ${novo.nome}`,
      dadosEvento,
    )
    const evento = await registrarEvento(tx, {
      chamadoId: id,
      tipo: 'STATUS_ALTERADO',
      atorId: u.id,
      assentamentoId: sistema,
      dados: dadosEvento,
    })
    return {
      chamadoId: id,
      efeitos: {
        eventoIds: [evento],
        assentamentoIds: [sistema],
        campos: novo.tipo === 'ABERTO' ? ['status', 'operador'] : ['status'],
        acessoMudou: false,
        fila: 'status',
      },
    }
  })
  return concluirAcao(u, r, agora, log)
}

// ───────── prioridade ─────────

/** Nova prioridade (ativa) em chamado ainda não concluído. Refaz o snapshot de SLA: a meta do problema continua valendo. */
export async function trocarPrioridade(
  id: number,
  dados: PrioridadeChamadoBody,
  ctx: ContextoUsuario,
  log?: LogErro,
): Promise<ChamadoDetalhe> {
  const u = ctx.usuario
  const agora = new Date()
  const r = await prisma.$transaction(async (tx): Promise<Resultado> => {
    const c = await exigirAcao(tx, u, id, 'prioridade', agora)
    if (c.versao !== dados.versao) throw conflito(MSG_VERSAO)
    const nova = await tx.prioridade.findFirst({
      where: { id: dados.prioridadeId, ativo: true },
      select: { id: true, nome: true },
    })
    if (!nova) throw regraNegocio('Prioridade inexistente ou inativa.')
    if (nova.id === c.prioridadeId) throw regraNegocio('O chamado já está com essa prioridade.')

    const sla = await snapshotSla(tx, { problemaId: c.problemaId, prioridadeId: nova.id, areaId: c.areaId })
    await atualizarComVersao(tx, id, dados.versao, {
      prioridadeId: nova.id,
      jornadaId: sla.jornadaId,
      slaRespostaMin: sla.slaRespostaMin,
      slaSolucaoMin: sla.slaSolucaoMin,
    })
    await recalcularChamado(tx, id, agora)

    const dadosEvento = { de: { id: c.prioridadeId, nome: c.prioridade.nome }, para: { id: nova.id, nome: nova.nome } }
    const sistema = await registrarSistema(
      tx,
      id,
      'PRIORIDADE_ALTERADA',
      `Prioridade alterada de ${c.prioridade.nome} para ${nova.nome}`,
      dadosEvento,
    )
    const evento = await registrarEvento(tx, {
      chamadoId: id,
      tipo: 'PRIORIDADE_ALTERADA',
      atorId: u.id,
      assentamentoId: sistema,
      dados: dadosEvento,
    })
    return {
      chamadoId: id,
      efeitos: {
        eventoIds: [evento],
        assentamentoIds: [sistema],
        campos: ['prioridade'],
        acessoMudou: false,
        fila: 'prioridade',
      },
    }
  })
  return concluirAcao(u, r, agora, log)
}
