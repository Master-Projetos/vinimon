import { type BuscaQuery, type BuscaResposta, idChamadoExato, temPermissao, tokensBusca } from '@vinimon/shared'
import { escopoChamados } from '../../autorizacao/chamados'
import type { Prisma } from '../../generated/prisma/client'
import { escaparLike } from '../../lib/like'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'

const selectChamado = {
  id: true,
  assunto: true,
  status: { select: { nome: true, tipo: true } },
} satisfies Prisma.ChamadoSelect

const contemTodos = (tokens: string[]) => tokens.map((t) => ({ buscaNorm: { contains: escaparLike(t) } }))

/** Chamados do escopo do usuário. O número exato vem primeiro; o status ignorado (C02) só aparece pelo número. */
async function buscarChamados(u: UsuarioSessao, q: string, tokens: string[], limite: number) {
  const escopo = escopoChamados(u)
  const numero = idChamadoExato(q)
  const [exato, porTexto] = await prisma.$transaction([
    prisma.chamado.findMany({
      where: { AND: [escopo, { id: numero ?? 0 }] },
      select: selectChamado,
      take: 1,
    }),
    prisma.chamado.findMany({
      where: {
        AND: [
          escopo,
          { status: { ignorado: false } },
          ...(numero === null ? [] : [{ id: { not: numero } }]),
          ...(tokens.length === 0 ? [{ id: 0 }] : [{ AND: contemTodos(tokens) }]),
        ],
      },
      select: selectChamado,
      orderBy: { id: 'desc' },
      take: limite,
    }),
  ])
  return [...exato, ...porTexto]
    .slice(0, limite)
    .map((c) => ({ id: c.id, assunto: c.assunto, statusNome: c.status.nome, statusTipo: c.status.tipo }))
}

/** Artigos PUBLICADOS por tsvector; sem `conhecimento.verInterno`, só os PUBLICO (S108). */
function buscarArtigos(u: UsuarioSessao, tokens: string[], limite: number) {
  if (tokens.length === 0) return []
  const tsq = tokens.map((t) => `${t}:*`).join(' & ')
  const podeInterno = temPermissao(u.perfil, 'conhecimento.verInterno')
  return prisma.$queryRaw<{ id: number; titulo: string; resumo: string | null }[]>`
    SELECT id, titulo, resumo
    FROM artigos, to_tsquery('portuguese', public.f_unaccent(${tsq})) q
    WHERE busca @@ q AND situacao = 'PUBLICADO' AND (visibilidade = 'PUBLICO' OR ${podeInterno}::boolean)
    ORDER BY ts_rank_cd(busca, q) DESC, id DESC
    LIMIT ${limite}`
}

export async function buscar(query: BuscaQuery, u: UsuarioSessao): Promise<BuscaResposta> {
  const tokens = tokensBusca(query.q)
  const { limite } = query
  const equipe = temPermissao(u.perfil, 'chamado.atender')
  const [chamados, artigos, ativos, usuarios] = await Promise.all([
    buscarChamados(u, query.q, tokens, limite),
    buscarArtigos(u, tokens, limite),
    equipe && tokens.length > 0
      ? prisma.ativo.findMany({
          where: { AND: contemTodos(tokens) },
          select: { id: true, etiqueta: true, modelo: true },
          orderBy: { id: 'desc' },
          take: limite,
        })
      : [],
    equipe && tokens.length > 0
      ? prisma.usuario.findMany({
          where: { AND: [{ ativo: true }, ...contemTodos(tokens)] },
          select: { id: true, nome: true, perfil: true },
          orderBy: { nome: 'asc' },
          take: limite,
        })
      : [],
  ])
  return { chamados, artigos, ativos, usuarios }
}
