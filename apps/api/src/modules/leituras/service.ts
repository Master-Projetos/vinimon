import type { Leitura, LeituraMarcada } from '@vinimon/shared'
import { comEscopo, podeVerChamado, podeVerInterno } from '../../autorizacao/chamados'
import { naoEncontrado, regraNegocio } from '../../lib/erros'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'
import { tempoReal } from '../../lib/tempo-real'
import { contarNaoLidas } from '../notificacoes/service'

async function carregarVisivel(id: number, u: UsuarioSessao) {
  const c = comEscopo(
    await prisma.chamado.findUnique({
      where: { id },
      select: {
        id: true,
        areaId: true,
        operadorId: true,
        solicitanteId: true,
        solicitante: { select: { areaId: true } },
        auxiliares: { select: { usuarioId: true } },
      },
    }),
  )
  if (!c || !podeVerChamado(u, c)) throw naoEncontrado('Chamado não encontrado.')
  return c
}

/**
 * `POST /chamados/:id/leitura`: avança o ponteiro de leitura de forma monotônica (nunca regride). O assentamento
 * precisa ser do chamado e visível a quem lê (interno só com `podeVerInterno`), senão 422. Quando o ponteiro avança,
 * marca como lidas as notificações do chamado (exceto AVALIACAO_PENDENTE) e, depois do commit, emite a leitura e a
 * contagem nova.
 */
export async function marcarLeitura(id: number, assentamentoId: number, u: UsuarioSessao): Promise<LeituraMarcada> {
  const c = await carregarVisivel(id, u)
  const alvo = await prisma.assentamento.findFirst({
    where: { id: assentamentoId, chamadoId: id },
    select: { id: true, interno: true },
  })
  if (!alvo || (alvo.interno && !podeVerInterno(u, c)))
    throw regraNegocio('O assentamento não pertence a este chamado.')

  const r = await prisma.$transaction(async (tx) => {
    const avancou = await tx.$queryRaw<Array<{ ultimo_assentamento_lido_id: number; lido_em: Date }>>`
      INSERT INTO chamado_leituras (chamado_id, usuario_id, ultimo_assentamento_lido_id, lido_em)
      VALUES (${id}, ${u.id}, ${assentamentoId}, now())
      ON CONFLICT (chamado_id, usuario_id) DO UPDATE
      SET ultimo_assentamento_lido_id = EXCLUDED.ultimo_assentamento_lido_id, lido_em = now()
      WHERE chamado_leituras.ultimo_assentamento_lido_id < EXCLUDED.ultimo_assentamento_lido_id
      RETURNING ultimo_assentamento_lido_id, lido_em`
    const linha = avancou[0]
    if (!linha) {
      const atual = await tx.chamadoLeitura.findUniqueOrThrow({
        where: { chamadoId_usuarioId: { chamadoId: id, usuarioId: u.id } },
        select: { ultimoAssentamentoLidoId: true },
      })
      return { avancou: false as const, ponteiro: atual.ultimoAssentamentoLidoId }
    }
    // fecha o grupo (renomeia a chave) para que a próxima notificação nasça como linha nova (§3.8)
    await tx.$executeRaw`
      UPDATE notificacoes SET lida_em = now(), grupo_chave = grupo_chave || '#' || id
      WHERE usuario_id = ${u.id} AND chamado_id = ${id} AND lida_em IS NULL
        AND tipo <> 'AVALIACAO_PENDENTE'::tipo_notificacao`
    return { avancou: true as const, ponteiro: linha.ultimo_assentamento_lido_id, lidoEm: linha.lido_em }
  })

  if (r.avancou) {
    try {
      tempoReal.emitirLeitura(id, u.id, r.ponteiro, r.lidoEm)
      tempoReal.emitirContagem(u.id, await contarNaoLidas(u))
    } catch {
      // falha de socket nunca desfaz a leitura
    }
  }
  return { ultimoAssentamentoLidoId: r.ponteiro }
}

/**
 * `GET /chamados/:id/leituras`: só os participantes (solicitante, operador e seguidores). Quem não vê o interno
 * recebe o maior id público menor ou igual ao ponteiro (o valor real revelaria que existe conteúdo interno, S49).
 */
export async function listarLeituras(id: number, u: UsuarioSessao): Promise<Leitura[]> {
  const c = await carregarVisivel(id, u)
  const seguidores = await prisma.chamadoSeguidor.findMany({ where: { chamadoId: id }, select: { usuarioId: true } })
  const participantes = [
    ...new Set([
      c.solicitanteId,
      ...(c.operadorId === null ? [] : [c.operadorId]),
      ...seguidores.map((s) => s.usuarioId),
    ]),
  ]
  if (podeVerInterno(u, c)) {
    const linhas = await prisma.chamadoLeitura.findMany({
      where: { chamadoId: id, usuarioId: { in: participantes } },
      select: { ultimoAssentamentoLidoId: true, lidoEm: true, usuario: { select: { id: true, nome: true } } },
      orderBy: { lidoEm: 'desc' },
    })
    return linhas.map((l) => ({
      usuario: l.usuario,
      ultimoAssentamentoId: l.ultimoAssentamentoLidoId,
      lidoEm: l.lidoEm,
    }))
  }
  const linhas = await prisma.$queryRaw<
    Array<{ usuario_id: number; nome: string; publico: number | null; lido_em: Date }>
  >`
    SELECT l.usuario_id, us.nome, l.lido_em,
      (SELECT max(a.id) FROM assentamentos a
        WHERE a.chamado_id = l.chamado_id AND NOT a.interno AND a.id <= l.ultimo_assentamento_lido_id) AS publico
    FROM chamado_leituras l
    JOIN usuarios us ON us.id = l.usuario_id
    WHERE l.chamado_id = ${id} AND l.usuario_id = ANY(${participantes}::int[])
    ORDER BY l.lido_em DESC`
  return linhas.flatMap((l) =>
    l.publico === null
      ? []
      : [{ usuario: { id: l.usuario_id, nome: l.nome }, ultimoAssentamentoId: l.publico, lidoEm: l.lido_em }],
  )
}
