import { type ChamadoDetalhe, type CriarChamado, temPermissao } from '@vinimon/shared'
import {
  acoesDoUsuario,
  comAuxiliarIds,
  escopoChamados,
  podeAtender,
  podeVerChamado,
  podeVerInterno,
  selectEscopo,
} from '../../autorizacao/chamados'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import { obterConfig } from '../../lib/config'
import type { ContextoUsuario } from '../../lib/contexto'
import { ErroApp, regraNegocio, semPermissao } from '../../lib/erros'
import { prisma, type Tx } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'
import { recalcularChamado, snapshotSla } from '../sla/service'
import { garantirTags } from '../tags/service'
import { aposCommitChamado, type LogErro, registrarEvento, registrarSistema } from './eventos'
import { selectChamadoDetalhe } from './schemas'

const DEZ_MINUTOS_MS = 10 * 60 * 1000
const MAX_FILHOS = 100

const invalido = (campo: string, mensagem: string) =>
  new ErroApp(400, 'REQUISICAO_INVALIDA', 'Dados inválidos.', [{ campo, mensagem }])

/**
 * Monta o `ChamadoDetalhe` do ponto de vista de `u`. NÃO confere o escopo: a rota de leitura (T-5.6) chama
 * `podeVerChamado` antes (fora do escopo é 404), e o `POST` devolve o que o próprio autor acabou de criar.
 * `descricaoTecnica` só para quem vê interno; `tags` só para a equipe (`chamado.atender`).
 */
export async function montarDetalhe(
  u: UsuarioSessao,
  id: number,
  agora = new Date(),
  tx: Tx = prisma,
): Promise<ChamadoDetalhe> {
  const c = await tx.chamado.findUniqueOrThrow({ where: { id }, select: selectChamadoDetalhe })
  const escopo = {
    areaId: c.areaId,
    operadorId: c.operadorId,
    solicitanteId: c.solicitanteId,
    auxiliarIds: c.auxiliares.map((a) => a.usuarioId),
  }
  const verInterno = podeVerInterno(u, escopo)
  const ehEquipe = temPermissao(u.perfil, 'chamado.atender')

  // pai e filhos: só os que `u` pode ver (S44); a lista de filhos é limitada
  const visiveis = (extra: Prisma.ChamadoWhereInput): Prisma.ChamadoWhereInput => ({
    AND: [escopoChamados(u), extra],
  })
  const selectSub = { id: true, assunto: true, statusTipo: true } satisfies Prisma.ChamadoSelect

  const [qtdAnexos, leitura, pai, filhos] = await Promise.all([
    tx.anexo.count({ where: { chamadoId: id, ...(verInterno ? {} : { interno: false }) } }),
    tx.chamadoLeitura.findUnique({
      where: { chamadoId_usuarioId: { chamadoId: id, usuarioId: u.id } },
      select: { ultimoAssentamentoLidoId: true },
    }),
    c.chamadoPaiId === null
      ? null
      : tx.chamado.findFirst({ where: visiveis({ id: c.chamadoPaiId }), select: selectSub }),
    tx.chamado.findMany({
      where: visiveis({ chamadoPaiId: id }),
      select: selectSub,
      orderBy: { id: 'asc' },
      take: MAX_FILHOS,
    }),
  ])
  // quem vê interno compara com o último assentamento qualquer; os demais, só com o último público
  const ultimo = verInterno ? c.ultimoAssentamentoId : c.ultimoAssentamentoPublicoId
  const naoLido = ultimo !== null && (leitura === null || leitura.ultimoAssentamentoLidoId < ultimo)

  const participantes: ChamadoDetalhe['participantes'] = [
    { id: c.solicitante.id, nome: c.solicitante.nome, papel: 'SOLICITANTE' },
  ]
  if (c.operador) participantes.push({ id: c.operador.id, nome: c.operador.nome, papel: 'OPERADOR' })
  for (const s of c.seguidores) {
    if (s.usuarioId === c.solicitante.id || s.usuarioId === c.operador?.id) continue
    participantes.push({ id: s.usuario.id, nome: s.usuario.nome, papel: 'SEGUIDOR' })
  }

  const cfg = await obterConfig()
  const acoes = acoesDoUsuario(
    u,
    { ...escopo, statusTipo: c.statusTipo, papel: c.status.papel, cancelado: c.cancelado, encerradoEm: c.encerradoEm },
    cfg,
    agora,
  )

  return {
    id: c.id,
    assunto: c.assunto,
    novo: agora.getTime() - c.abertoEm.getTime() < DEZ_MINUTOS_MS,
    cancelado: c.cancelado,
    status: c.status,
    prioridade: c.prioridade,
    area: c.area,
    problema: c.problema,
    solicitante: c.solicitante,
    operador: c.operador,
    abertoEm: c.abertoEm,
    agendadoPara: c.agendadoPara,
    ultimaAtividadeEm: c.ultimaAtividadeEm,
    ultimaInteracao: c.ultimaInteracaoEm ? { em: c.ultimaInteracaoEm, autorId: c.ultimaInteracaoAutorId } : null,
    naoLido,
    qtdAnexos,
    sla: {
      resposta: {
        meta: c.slaRespostaMin,
        prazo: c.prazoRespostaEm,
        alerta: c.alertaRespostaEm,
        cumprido: c.slaRespostaCumprido,
        finalizado: c.primeiraRespostaEm !== null,
      },
      solucao: {
        meta: c.slaSolucaoMin,
        prazo: c.prazoSolucaoEm,
        alerta: c.alertaSolucaoEm,
        cumprido: c.slaSolucaoCumprido,
        finalizado: c.concluidoEm !== null,
      },
    },
    descricao: c.descricao,
    solucao: c.solucao,
    ...(verInterno ? { descricaoTecnica: c.descricaoTecnica } : {}),
    contato: c.contato,
    contatoEmail: c.contatoEmail,
    telefone: c.telefone,
    abertoPor: c.abertoPor,
    canal: c.canal,
    departamento: c.departamento,
    ativo: c.ativo,
    primeiraRespostaEm: c.primeiraRespostaEm,
    concluidoEm: c.concluidoEm,
    encerradoEm: c.encerradoEm,
    validacaoLimiteEm: c.validacaoLimiteEm,
    statusDesde: c.statusDesde,
    rejeicoes: c.rejeicoes,
    versao: c.versao,
    participantes,
    ...(ehEquipe ? { tags: c.tags.map((t) => t.tag).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) } : {}),
    avaliacao: c.avaliacao,
    seguindo: c.seguidores.some((s) => s.usuarioId === u.id && s.silenciadoEm === null),
    pai,
    filhos,
    acoes,
  }
}

/**
 * `POST /chamados` (§3.5, "abrir"). Validações nesta ordem: problema ativo; USUARIO (área e canal proibidos, só em
 * nome de si); equipe (`areaId` entre as áreas do problema); em nome de outro (`chamado.abrirEmNome`, alvo ativo,
 * OPERADOR não escolhe ADMIN, S50). Efeitos (socket) só depois do commit.
 */
export async function abrirChamado(dados: CriarChamado, ctx: ContextoUsuario, log?: LogErro): Promise<ChamadoDetalhe> {
  const u = ctx.usuario
  const ehUsuario = !temPermissao(u.perfil, 'chamado.abrirEmNome')
  const ehEquipe = temPermissao(u.perfil, 'chamado.atender')

  const problema = await prisma.problema.findFirst({
    where: { id: dados.problemaId, ativo: true },
    select: { id: true, areaPadraoId: true, areas: { select: { areaId: true } } },
  })
  if (!problema) throw invalido('problemaId', 'Problema inexistente ou inativo.')

  if (ehUsuario) {
    if (dados.areaId !== undefined) throw invalido('areaId', 'A área é definida pelo problema.')
    if (dados.canalId !== undefined) throw invalido('canalId', 'O canal é definido pelo sistema.')
    if (dados.solicitanteId !== undefined && dados.solicitanteId !== u.id)
      throw semPermissao('Você só pode abrir chamado em seu nome.')
  }
  if (!ehEquipe && dados.tags !== undefined) throw invalido('tags', 'Só a equipe informa tags.')

  const areaId = ehUsuario ? problema.areaPadraoId : (dados.areaId ?? problema.areaPadraoId)
  if (areaId === null) throw regraNegocio('O problema escolhido não tem área de atendimento. Fale com o administrador.')
  if (!ehUsuario && !problema.areas.some((a) => a.areaId === areaId))
    throw invalido('areaId', 'A área não atende esse problema.')

  const solicitanteId = dados.solicitanteId ?? u.id
  const emNomeDeOutro = solicitanteId !== u.id
  const solicitante = await prisma.usuario.findFirst({
    where: { id: solicitanteId, ...(emNomeDeOutro ? {} : { ativo: true }) },
    select: { id: true, nome: true, email: true, telefone: true, perfil: true, ativo: true },
  })
  if (emNomeDeOutro) {
    if (!temPermissao(u.perfil, 'chamado.abrirEmNome')) throw semPermissao()
    if (!solicitante || !solicitante.ativo) throw invalido('solicitanteId', 'Usuário inexistente ou inativo.')
    if (u.perfil === 'OPERADOR' && solicitante.perfil === 'ADMIN')
      throw semPermissao('Você não pode abrir chamado em nome de um administrador.')
  }
  if (!solicitante) throw invalido('solicitanteId', 'Usuário inexistente ou inativo.')

  const agora = new Date()
  const canalNome = emNomeDeOutro ? 'Telefone' : 'Sistema Web'
  const efeitos = await prisma.$transaction(async (tx) => {
    const canal =
      !ehUsuario && dados.canalId !== undefined
        ? await tx.canal.findFirst({ where: { id: dados.canalId, ativo: true }, select: { id: true } })
        : await tx.canal.findFirst({ where: { nome: canalNome, ativo: true }, select: { id: true } })
    if (!canal) throw invalido('canalId', 'Canal inexistente ou inativo.')
    const prioridade =
      dados.prioridadeId !== undefined
        ? await tx.prioridade.findFirst({ where: { id: dados.prioridadeId, ativo: true }, select: { id: true } })
        : await tx.prioridade.findFirst({ where: { padrao: true, ativo: true }, select: { id: true } })
    if (!prioridade) throw invalido('prioridadeId', 'Prioridade inexistente ou inativa.')
    if (
      dados.departamentoId !== undefined &&
      !(await tx.departamento.findFirst({ where: { id: dados.departamentoId, ativo: true }, select: { id: true } }))
    ) {
      throw invalido('departamentoId', 'Departamento inexistente ou inativo.')
    }
    if (
      dados.ativoId !== undefined &&
      !(await tx.ativo.findUnique({ where: { id: dados.ativoId }, select: { id: true } }))
    ) {
      throw invalido('ativoId', 'Ativo não encontrado.')
    }
    // subchamado: quem abre precisa ver e atender o pai (404/403 só dizem o que `u` já pode saber)
    let paiId: number | null = null
    if (dados.paiId !== undefined) {
      const pai = comAuxiliarIds(
        await tx.chamado.findUnique({
          where: { id: dados.paiId },
          select: { id: true, statusTipo: true, ...selectEscopo },
        }),
      )
      if (!pai || !podeVerChamado(u, pai)) throw invalido('paiId', 'Chamado pai não encontrado.')
      if (!podeAtender(u, pai)) throw semPermissao('Você precisa atender o chamado pai para abrir um subchamado.')
      if (pai.statusTipo === 'ENCERRADO') throw regraNegocio('O chamado pai está encerrado.')
      paiId = pai.id
    }
    const inicial = await tx.status.findFirst({
      where: { papel: 'INICIAL', ativo: true },
      select: { id: true, tipo: true, pausaSla: true },
    })
    if (!inicial) throw regraNegocio('Não há status inicial configurado.')

    const sla = await snapshotSla(tx, { problemaId: problema.id, prioridadeId: prioridade.id, areaId })
    const criado = await tx.chamado.create({
      data: {
        assunto: dados.assunto,
        descricao: dados.descricao,
        contato: dados.contato ?? solicitante.nome,
        contatoEmail: dados.contatoEmail ?? solicitante.email,
        telefone: dados.telefone ?? solicitante.telefone,
        solicitanteId: solicitante.id,
        abertoPorId: u.id,
        areaId,
        problemaId: problema.id,
        prioridadeId: prioridade.id,
        canalId: canal.id,
        departamentoId: dados.departamentoId ?? null,
        ativoId: dados.ativoId ?? null,
        statusId: inicial.id,
        statusTipo: inicial.tipo,
        statusDesde: agora,
        slaPausado: inicial.pausaSla,
        abertoEm: agora,
        ultimaAtividadeEm: agora,
        jornadaId: sla.jornadaId,
        slaRespostaMin: sla.slaRespostaMin,
        slaSolucaoMin: sla.slaSolucaoMin,
        chamadoPaiId: paiId,
      },
      select: { id: true },
    })

    await tx.chamadoSeguidor.createMany({
      data: [
        { chamadoId: criado.id, usuarioId: solicitante.id, motivo: 'SOLICITANTE' as const },
        ...(emNomeDeOutro ? [{ chamadoId: criado.id, usuarioId: u.id, motivo: 'ABRIU' as const }] : []),
      ],
      skipDuplicates: true,
    })

    if (ehEquipe && dados.tags !== undefined && dados.tags.length > 0) {
      const tagIds = await garantirTags(tx, dados.tags)
      await tx.chamadoTag.createMany({
        data: tagIds.map((tagId) => ({ chamadoId: criado.id, tagId })),
        skipDuplicates: true,
      })
    }

    const assentamentoId = await registrarSistema(
      tx,
      criado.id,
      'CRIADO',
      emNomeDeOutro ? `Aberto por ${u.nome} em nome de ${solicitante.nome}` : 'Chamado aberto',
      emNomeDeOutro
        ? { abertoPor: { id: u.id, nome: u.nome }, solicitante: { id: solicitante.id, nome: solicitante.nome } }
        : undefined,
    )
    const eventoId = await registrarEvento(tx, {
      chamadoId: criado.id,
      tipo: 'CRIADO',
      atorId: u.id,
      assentamentoId,
      dados: { emNomeDeOutro, areaId, problemaId: problema.id, prioridadeId: prioridade.id },
    })
    // subchamado: um evento interno em cada chamado (o id do outro não aparece para quem não vê interno)
    let eventoPaiId: number | null = null
    if (paiId !== null) {
      const dadosVinculo = { paiId, filhoId: criado.id }
      await registrarEvento(tx, {
        chamadoId: criado.id,
        tipo: 'SUBCHAMADO_VINCULADO',
        atorId: u.id,
        interno: true,
        dados: dadosVinculo,
      })
      eventoPaiId = await registrarEvento(tx, {
        chamadoId: paiId,
        tipo: 'SUBCHAMADO_VINCULADO',
        atorId: u.id,
        interno: true,
        dados: dadosVinculo,
      })
    }
    await recalcularChamado(tx, criado.id, agora)
    if (emNomeDeOutro) {
      await auditar(tx, ctx, {
        acao: 'chamado.abertoEmNome',
        entidade: 'chamado',
        entidadeId: criado.id,
        dados: { solicitanteId: solicitante.id },
      })
    }
    return { chamadoId: criado.id, eventoId, assentamentoId, paiId, eventoPaiId }
  })

  await aposCommitChamado({
    chamadoId: efeitos.chamadoId,
    eventoIds: [efeitos.eventoId],
    assentamentoIds: [efeitos.assentamentoId],
    campos: [],
    acessoMudou: false,
    fila: 'criado',
    ...(log ? { log } : {}),
  })
  if (efeitos.paiId !== null && efeitos.eventoPaiId !== null) {
    await aposCommitChamado({
      chamadoId: efeitos.paiId,
      eventoIds: [efeitos.eventoPaiId],
      assentamentoIds: [],
      campos: ['classificacao'],
      acessoMudou: false,
      fila: null,
      ...(log ? { log } : {}),
    })
  }
  return montarDetalhe(u, efeitos.chamadoId, agora)
}
