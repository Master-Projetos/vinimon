import {
  type Assentamento,
  type ComentarChamado,
  type ComentarResposta,
  extrairMencoes,
  type Mencao as MencaoTexto,
  temPermissao,
} from '@vinimon/shared'
import { acoesDoUsuario, type ChamadoParaAcoes, podeVerChamado, podeVerInterno } from '../../autorizacao/chamados'
import { Prisma } from '../../generated/prisma/client'
import { obterConfig } from '../../lib/config'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado, semPermissao } from '../../lib/erros'
import { prisma, type Tx } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'
import { aposCommitChamado, type EfeitosChamado, type LogErro, registrarEvento } from '../chamados/eventos'
import { aplicarTransicaoStatus, recalcularChamado } from '../sla/service'
import { selectAssentamento } from './schemas'

type LinhaAssentamento = Prisma.AssentamentoGetPayload<{ select: typeof selectAssentamento }>

function paraDto(a: LinhaAssentamento): Assentamento {
  const dados = a.dados !== null && typeof a.dados === 'object' && !Array.isArray(a.dados) ? a.dados : null
  return { ...a, dados: dados as Assentamento['dados'] }
}

const selectParaComentar = {
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
  status: { select: { papel: true } },
} satisfies Prisma.ChamadoSelect

/** Fora do escopo é 404, igual a inexistente (S46). */
async function carregarVisivel(id: number, u: UsuarioSessao) {
  const c = await prisma.chamado.findUnique({ where: { id }, select: selectParaComentar })
  if (!c || !podeVerChamado(u, c)) throw naoEncontrado('Chamado não encontrado.')
  return c
}

/**
 * `GET /chamados/:id/assentamentos`: o interno só aparece para `podeVerInterno`. Página mais recente primeiro por
 * cursor de id (`antesDe`), devolvida em ordem crescente; `proximoCursor` é o id mais antigo da página, se há mais.
 */
export async function listarAssentamentos(
  id: number,
  q: { antesDe?: number | undefined; limite: number },
  u: UsuarioSessao,
) {
  const c = await carregarVisivel(id, u)
  const linhas = await prisma.assentamento.findMany({
    where: {
      AND: [
        { chamadoId: id },
        podeVerInterno(u, c) ? {} : { interno: false },
        q.antesDe === undefined ? {} : { id: { lt: q.antesDe } },
      ],
    },
    select: selectAssentamento,
    orderBy: { id: 'desc' },
    take: q.limite + 1,
  })
  const temMais = linhas.length > q.limite
  const pagina = temMais ? linhas.slice(0, q.limite) : linhas
  const ultima = pagina.at(-1)
  return {
    itens: pagina.reverse().map(paraDto),
    proximoCursor: temMais && ultima ? ultima.id : null,
  }
}

/** Menções que valem: ativo, com acesso ao chamado e, em comentário interno, também ao conteúdo interno (S100). */
async function resolverMencoes(
  mencoes: MencaoTexto[],
  c: Pick<Prisma.ChamadoGetPayload<{ select: typeof selectParaComentar }>, 'areaId' | 'operadorId' | 'solicitanteId'>,
  interno: boolean,
  autorId: number,
): Promise<{ validas: number[]; ignoradas: MencaoTexto[] }> {
  const candidatos = mencoes.filter((m) => m.id !== autorId)
  if (candidatos.length === 0) return { validas: [], ignoradas: [] }
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: candidatos.map((m) => m.id) }, ativo: true },
    select: {
      id: true,
      nome: true,
      login: true,
      perfil: true,
      areaId: true,
      areasSecundarias: { select: { areaId: true } },
    },
  })
  const validos = new Set<number>()
  for (const x of usuarios) {
    const secundarias = x.areasSecundarias.map((a) => a.areaId)
    const comoSessao: UsuarioSessao = {
      id: x.id,
      nome: x.nome,
      login: x.login,
      perfil: x.perfil,
      areaId: x.areaId,
      areaIds: x.areaId === null ? secundarias : [x.areaId, ...secundarias],
      sessaoId: '',
      estado: 'ATIVA',
      mfaAtivo: false,
    }
    if (podeVerChamado(comoSessao, c) && (!interno || podeVerInterno(comoSessao, c))) validos.add(x.id)
  }
  return {
    validas: candidatos.filter((m) => validos.has(m.id)).map((m) => m.id),
    ignoradas: candidatos.filter((m) => !validos.has(m.id)),
  }
}

async function seguirComo(tx: Tx, chamadoId: number, usuarioId: number, motivo: 'COMENTOU' | 'MENCIONADO') {
  if (motivo === 'COMENTOU') {
    // comentar volta a seguir: limpa o silenciamento (§3.8)
    await tx.chamadoSeguidor.upsert({
      where: { chamadoId_usuarioId: { chamadoId, usuarioId } },
      create: { chamadoId, usuarioId, motivo },
      update: { silenciadoEm: null },
    })
  } else {
    await tx.chamadoSeguidor.createMany({ data: [{ chamadoId, usuarioId, motivo }], skipDuplicates: true })
  }
}

/**
 * `POST /chamados/:id/assentamentos`: comenta no chamado. Idempotente por `(autorId, clienteId)`: o reenvio devolve
 * o existente (`criado: false`, resposta 200). Passos: carregar → escopo (404) → idempotência → `acoesDoUsuario`
 * (403) → transação → efeitos depois do commit.
 */
export async function comentar(
  id: number,
  dados: ComentarChamado,
  ctx: ContextoUsuario,
  log?: LogErro,
): Promise<{ criado: boolean; resposta: ComentarResposta }> {
  const u = ctx.usuario
  const agora = new Date()
  const c = await carregarVisivel(id, u)

  const existente = await prisma.assentamento.findUnique({
    where: { autorId_clienteId: { autorId: u.id, clienteId: dados.clienteId } },
    select: { ...selectAssentamento },
  })
  if (existente) {
    if (existente.chamadoId !== id) throw naoEncontrado('Chamado não encontrado.')
    return { criado: false, resposta: { assentamento: paraDto(existente), mencoesIgnoradas: [] } }
  }

  const paraAcoes: ChamadoParaAcoes = { ...c, papel: c.status.papel }
  const acoes = acoesDoUsuario(u, paraAcoes, await obterConfig(), agora)
  if (!acoes.comentar || (dados.interno && !acoes.comentarInterno)) {
    throw semPermissao('Esta ação não está disponível para o chamado neste momento.')
  }

  const { validas, ignoradas } = await resolverMencoes(extrairMencoes(dados.texto), c, dados.interno, u.id)

  try {
    const r = await prisma.$transaction(async (tx) => {
      const criado = await tx.assentamento.create({
        data: {
          chamadoId: id,
          autorId: u.id,
          tipo: 'COMENTARIO',
          interno: dados.interno,
          texto: dados.texto,
          clienteId: dados.clienteId,
        },
        select: selectAssentamento,
      })
      if (validas.length > 0) {
        await tx.mencao.createMany({
          data: validas.map((usuarioId) => ({ assentamentoId: criado.id, usuarioId, chamadoId: id })),
        })
        await tx.chamadoSeguidor.createMany({
          data: validas.map((usuarioId) => ({ chamadoId: id, usuarioId, motivo: 'MENCIONADO' as const })),
          skipDuplicates: true,
        })
      }
      await seguirComo(tx, id, u.id, 'COMENTOU')

      // primeira resposta (C11): só comentário público de quem atende e não é o solicitante
      const primeiraResposta =
        !dados.interno &&
        c.primeiraRespostaEm === null &&
        c.solicitanteId !== u.id &&
        temPermissao(u.perfil, 'chamado.atender')

      // o solicitante respondendo tira o chamado de "aguardando solicitante"
      const volta = c.solicitanteId === u.id && c.status.papel === 'AGUARDANDO_SOLICITANTE'
      if (volta) {
        const emAtendimento = await tx.status.findFirstOrThrow({
          where: { papel: 'EM_ATENDIMENTO', ativo: true },
          select: { id: true },
        })
        await aplicarTransicaoStatus(tx, {
          chamadoId: id,
          versao: c.versao,
          novoStatusId: emAtendimento.id,
          atorId: u.id,
          agora,
        })
      }

      await tx.chamado.update({
        where: { id },
        data: {
          ultimoAssentamentoId: criado.id,
          ...(dados.interno
            ? {}
            : {
                ultimoAssentamentoPublicoId: criado.id,
                ultimaInteracaoEm: agora,
                ultimaInteracaoAutorId: u.id,
                ultimaAtividadeEm: agora, // só o evento público mexe na atividade (S49)
              }),
          ...(primeiraResposta ? { primeiraRespostaEm: agora } : {}),
        },
      })
      if (primeiraResposta || volta) await recalcularChamado(tx, id, agora)

      const evento = await registrarEvento(tx, {
        chamadoId: id,
        tipo: 'COMENTARIO',
        atorId: u.id,
        assentamentoId: criado.id,
        interno: dados.interno,
        dados: { mencionados: validas },
      })
      const efeitos: EfeitosChamado = {
        eventoIds: [evento],
        assentamentoIds: [criado.id],
        campos: volta ? ['status'] : [], // comentário em si nunca invalida cache
        acessoMudou: false,
        fila: volta ? 'status' : null,
      }
      return { criado, efeitos }
    })
    await aposCommitChamado({ chamadoId: id, ...r.efeitos, ...(log ? { log } : {}) })
    return { criado: true, resposta: { assentamento: paraDto(r.criado), mencoesIgnoradas: ignoradas } }
  } catch (err) {
    // corrida do mesmo `clienteId`: perdeu a transação, devolve o que o outro pedido gravou
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const igual = await prisma.assentamento.findUnique({
        where: { autorId_clienteId: { autorId: u.id, clienteId: dados.clienteId } },
        select: selectAssentamento,
      })
      if (igual && igual.chamadoId === id) {
        return { criado: false, resposta: { assentamento: paraDto(igual), mencoesIgnoradas: [] } }
      }
    }
    throw err
  }
}
