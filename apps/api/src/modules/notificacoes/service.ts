import {
  type AtualizarPreferencias,
  canalEmailPadrao,
  type FiltroNotificacao,
  type ListarNotificacoesQuery,
  NotificacaoDadosSchema,
  type NotificacaoDTO,
  type NotificacoesPagina,
  type PreferenciasNotificacao,
  preferenciaPadrao,
  TIPOS_NOTIFICACAO,
  temPermissao,
  textoPlano,
} from '@vinimon/shared'
import { comEscopo, escopoChamados, podeVerInterno } from '../../autorizacao/chamados'
import type { Prisma } from '../../generated/prisma/client'
import { naoEncontrado, regraNegocio, requisicaoInvalida } from '../../lib/erros'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'
import { tempoReal } from '../../lib/tempo-real'

/**
 * Função única do que o usuário pode ver e contar (S103, T60): o feed, `GET /notificacoes/contagem`, o badge, o
 * `notificacao:contagem` e a contagem pós-fanout usam esta mesma regra. Reaplica o escopo do chamado na leitura
 * (quem perdeu o acesso deixa de ver) e a regra de interno. `AND`, nunca espalhado no mesmo objeto (S45).
 */
export function whereNotificacoesVisiveis(
  u: Pick<UsuarioSessao, 'id' | 'perfil' | 'areaIds'>,
): Prisma.NotificacaoWhereInput {
  const regraInterno: Prisma.NotificacaoWhereInput = temPermissao(u.perfil, 'chamado.verInterno')
    ? { OR: [{ interno: false }, { interno: true, chamado: { solicitanteId: { not: u.id } } }] }
    : { interno: false }
  return { AND: [{ usuarioId: u.id }, { chamado: escopoChamados(u as UsuarioSessao) }, regraInterno] }
}

const naoLidasWhere = (u: UsuarioSessao): Prisma.NotificacaoWhereInput => ({
  AND: [whereNotificacoesVisiveis(u), { lidaEm: null }],
})

export const contarNaoLidas = (u: UsuarioSessao): Promise<number> =>
  prisma.notificacao.count({ where: naoLidasWhere(u) })

const FILTRO_WHERE: Record<FiltroNotificacao, Prisma.NotificacaoWhereInput> = {
  todas: {},
  nao_lidas: { lidaEm: null },
  mencoes: { tipo: 'MENCAO' },
  atribuicoes: { tipo: 'ATRIBUIDO' },
  sla: { tipo: 'SLA' },
}

const codificarCursor = (atualizadoEm: Date, id: number) =>
  Buffer.from(`${atualizadoEm.toISOString()}|${id}`).toString('base64url')

function decodificarCursor(cursor: string): { atualizadoEm: Date; id: number } {
  const [iso, idTexto] = Buffer.from(cursor, 'base64url').toString().split('|')
  const atualizadoEm = new Date(iso ?? '')
  const id = Number(idTexto)
  if (Number.isNaN(atualizadoEm.getTime()) || !Number.isInteger(id) || id <= 0)
    throw requisicaoInvalida('Cursor inválido.')
  return { atualizadoEm, id }
}

/**
 * `GET /notificacoes`: reaplica escopo e interno na leitura. O trecho (até 140 caracteres) sai do assentamento, só
 * se ele for visível ao usuário; os atores vêm de uma única query, mapeada em memória.
 */
export async function listarNotificacoes(u: UsuarioSessao, q: ListarNotificacoesQuery): Promise<NotificacoesPagina> {
  const cursor = q.cursor === undefined ? null : decodificarCursor(q.cursor)
  const linhas = await prisma.notificacao.findMany({
    where: {
      AND: [
        whereNotificacoesVisiveis(u),
        FILTRO_WHERE[q.filtro],
        cursor === null
          ? {}
          : {
              OR: [
                { atualizadoEm: { lt: cursor.atualizadoEm } },
                { atualizadoEm: cursor.atualizadoEm, id: { lt: cursor.id } },
              ],
            },
      ],
    },
    select: {
      id: true,
      tipo: true,
      contagem: true,
      interno: true,
      assentamentoId: true,
      atorIds: true,
      dados: true,
      criadoEm: true,
      atualizadoEm: true,
      lidaEm: true,
      chamado: {
        select: {
          id: true,
          assunto: true,
          areaId: true,
          operadorId: true,
          solicitanteId: true,
          solicitante: { select: { areaId: true } },
          auxiliares: { select: { usuarioId: true } },
        },
      },
    },
    orderBy: [{ atualizadoEm: 'desc' }, { id: 'desc' }],
    take: q.limite + 1,
  })
  const temMais = linhas.length > q.limite
  const pagina = temMais ? linhas.slice(0, q.limite) : linhas

  const idsAtores = [...new Set(pagina.flatMap((n) => n.atorIds))]
  const idsAssentamentos = [...new Set(pagina.flatMap((n) => (n.assentamentoId === null ? [] : [n.assentamentoId])))]
  const [atores, assentamentos] = await Promise.all([
    idsAtores.length === 0
      ? []
      : prisma.usuario.findMany({ where: { id: { in: idsAtores } }, select: { id: true, nome: true } }),
    idsAssentamentos.length === 0
      ? []
      : prisma.assentamento.findMany({
          where: { id: { in: idsAssentamentos } },
          select: { id: true, texto: true, interno: true },
        }),
  ])
  const nomes = new Map(atores.map((a) => [a.id, a.nome]))
  const textos = new Map(assentamentos.map((a) => [a.id, a]))

  const itens: NotificacaoDTO[] = pagina.map((n) => {
    const a = n.assentamentoId === null ? undefined : textos.get(n.assentamentoId)
    const visivel = a !== undefined && (!a.interno || podeVerInterno(u, comEscopo(n.chamado)))
    const dados = NotificacaoDadosSchema.safeParse(n.dados)
    return {
      id: n.id,
      tipo: n.tipo,
      chamado: { id: n.chamado.id, assunto: n.chamado.assunto },
      atores: n.atorIds.flatMap((id) => {
        const nome = nomes.get(id)
        return nome === undefined ? [] : [{ id, nome }]
      }),
      contagem: n.contagem,
      interno: n.interno,
      trecho: visivel && a ? textoPlano(a.texto).slice(0, 140) : null,
      assentamentoId: n.assentamentoId,
      dados: dados.success ? dados.data : null,
      criadoEm: n.criadoEm,
      atualizadoEm: n.atualizadoEm,
      lida: n.lidaEm !== null,
    }
  })
  const ultima = pagina.at(-1)
  return { itens, proximoCursor: temMais && ultima ? codificarCursor(ultima.atualizadoEm, ultima.id) : null }
}

async function responderComContagem(u: UsuarioSessao): Promise<{ naoLidas: number }> {
  const naoLidas = await contarNaoLidas(u)
  try {
    tempoReal.emitirContagem(u.id, naoLidas)
  } catch {
    // falha de socket nunca desfaz a ação
  }
  return { naoLidas }
}

/** `POST /notificacoes/:id/lida`: fecha o grupo (`grupo_chave || '#' || id`). AVALIACAO_PENDENTE dá 422. */
export async function marcarLida(u: UsuarioSessao, id: number) {
  const n = await prisma.notificacao.findFirst({ where: { id, usuarioId: u.id }, select: { tipo: true } })
  if (!n) throw naoEncontrado('Notificação não encontrada.')
  if (n.tipo === 'AVALIACAO_PENDENTE') throw regraNegocio('Esta notificação só some quando você avalia o atendimento.')
  await prisma.$executeRaw`
    UPDATE notificacoes SET lida_em = now(), grupo_chave = grupo_chave || '#' || id
    WHERE id = ${id} AND usuario_id = ${u.id} AND lida_em IS NULL`
  return responderComContagem(u)
}

/** `POST /notificacoes/:id/nao-lida`: reabre a leitura; o grupo continua fechado (a próxima notificação nasce nova). */
export async function marcarNaoLida(u: UsuarioSessao, id: number) {
  const { count } = await prisma.notificacao.updateMany({ where: { id, usuarioId: u.id }, data: { lidaEm: null } })
  if (count === 0) throw naoEncontrado('Notificação não encontrada.')
  return responderComContagem(u)
}

/** `POST /notificacoes/lidas {chamadoId?}`: todas as não lidas (do chamado, se informado), menos AVALIACAO_PENDENTE. */
export async function marcarTodasLidas(u: UsuarioSessao, chamadoId: number | undefined) {
  if (chamadoId === undefined) {
    await prisma.$executeRaw`
      UPDATE notificacoes SET lida_em = now(), grupo_chave = grupo_chave || '#' || id
      WHERE usuario_id = ${u.id} AND lida_em IS NULL AND tipo <> 'AVALIACAO_PENDENTE'::tipo_notificacao`
  } else {
    await prisma.$executeRaw`
      UPDATE notificacoes SET lida_em = now(), grupo_chave = grupo_chave || '#' || id
      WHERE usuario_id = ${u.id} AND chamado_id = ${chamadoId} AND lida_em IS NULL
        AND tipo <> 'AVALIACAO_PENDENTE'::tipo_notificacao`
  }
  return responderComContagem(u)
}

async function preferenciasDe(u: UsuarioSessao): Promise<PreferenciasNotificacao> {
  const salvas = await prisma.preferenciaNotificacao.findMany({
    where: { usuarioId: u.id },
    select: { tipo: true, inApp: true, desktop: true, email: true },
  })
  const porTipo = new Map(salvas.map((p) => [p.tipo, p]))
  return {
    itens: TIPOS_NOTIFICACAO.map((tipo) => {
      const padrao = preferenciaPadrao(tipo, u.perfil)
      const salva = porTipo.get(tipo)
      const inApp = padrao.fixo ? true : (salva?.inApp ?? padrao.inapp)
      const desktop = inApp && (salva?.desktop ?? padrao.desktop)
      return { tipo, inApp, desktop, email: salva?.email ?? canalEmailPadrao(tipo, u.perfil), fixo: padrao.fixo }
    }),
  }
}

export const obterPreferencias = (u: UsuarioSessao) => preferenciasDe(u)

/**
 * `PUT /me/preferencias-notificacao`: só as diferenças do padrão vão para o banco. Desligar o in-app desliga o
 * desktop. Tipo fixo com `inApp = false` já foi barrado no schema (400).
 */
export async function atualizarPreferencias(u: UsuarioSessao, dados: AtualizarPreferencias) {
  await prisma.$transaction(async (tx) => {
    for (const item of dados.itens) {
      const padrao = preferenciaPadrao(item.tipo, u.perfil)
      const inApp = padrao.fixo ? true : item.inApp
      const desktop = inApp && item.desktop
      const emailPadrao = canalEmailPadrao(item.tipo, u.perfil)
      const atual = await tx.preferenciaNotificacao.findUnique({
        where: { usuarioId_tipo: { usuarioId: u.id, tipo: item.tipo } },
        select: { email: true },
      })
      const email = item.email ?? atual?.email ?? emailPadrao
      if (inApp === padrao.inapp && desktop === padrao.desktop && email === emailPadrao) {
        await tx.preferenciaNotificacao.deleteMany({ where: { usuarioId: u.id, tipo: item.tipo } })
      } else {
        await tx.preferenciaNotificacao.upsert({
          where: { usuarioId_tipo: { usuarioId: u.id, tipo: item.tipo } },
          create: { usuarioId: u.id, tipo: item.tipo, inApp, desktop, email },
          update: { inApp, desktop, email },
        })
      }
    }
  })
  return preferenciasDe(u)
}
