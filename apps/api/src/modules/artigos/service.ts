import {
  type AtualizarArtigo,
  type CriarArtigo,
  type ListarArtigosQuery,
  normalizarBusca,
  type SugestoesArtigosQuery,
  temPermissao,
  tokensBusca,
} from '@vinimon/shared'
import { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { ErroApp, naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma, type Tx } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'

const selectResumo = {
  id: true,
  titulo: true,
  resumo: true,
  categoriaId: true,
  situacao: true,
  visibilidade: true,
  visualizacoes: true,
  publicadoEm: true,
  atualizadoEm: true,
} satisfies Prisma.ArtigoSelect

const selectArtigo = {
  ...selectResumo,
  conteudo: true,
  autorId: true,
  problemas: { select: { problemaId: true }, orderBy: { problemaId: 'asc' } },
} satisfies Prisma.ArtigoSelect

/** S108: quem não vê conteúdo interno só enxerga PUBLICADO + PUBLICO; quem não gerencia nunca vê rascunho ou arquivado alheio. */
function whereVisivel(u: UsuarioSessao): Prisma.ArtigoWhereInput {
  if (temPermissao(u.perfil, 'conhecimento.gerenciar')) return {}
  if (!temPermissao(u.perfil, 'conhecimento.verInterno')) return { situacao: 'PUBLICADO', visibilidade: 'PUBLICO' }
  return { OR: [{ situacao: 'PUBLICADO' }, { autorId: u.id }] }
}

async function ler(tx: Tx, id: number) {
  const artigo = await tx.artigo.findUnique({ where: { id }, select: selectArtigo })
  if (!artigo) throw naoEncontrado('Artigo não encontrado.')
  const votos = await tx.artigoVoto.groupBy({ by: ['util'], where: { artigoId: id }, _count: { _all: true } })
  const { problemas, ...resto } = artigo
  return {
    ...resto,
    problemaIds: problemas.map((p) => p.problemaId),
    votosUteis: votos.find((v) => v.util)?._count._all ?? 0,
    votosNaoUteis: votos.find((v) => !v.util)?._count._all ?? 0,
  }
}

async function exigirVisivel(tx: Tx, id: number, u: UsuarioSessao) {
  const visivel = await tx.artigo.findFirst({ where: { AND: [{ id }, whereVisivel(u)] }, select: { id: true } })
  if (!visivel) throw naoEncontrado('Artigo não encontrado.')
}

async function validarReferencias(tx: Tx, categoriaId: number | null | undefined, problemaIds: number[] | undefined) {
  if (
    categoriaId != null &&
    !(await tx.categoriaArtigo.findUnique({ where: { id: categoriaId }, select: { id: true } }))
  ) {
    throw new ErroApp(400, 'REQUISICAO_INVALIDA', 'Dados inválidos.', [
      { campo: 'categoriaId', mensagem: 'Categoria não encontrada.' },
    ])
  }
  const unicos = [...new Set(problemaIds ?? [])]
  if (unicos.length > 0 && (await tx.problema.count({ where: { id: { in: unicos } } })) !== unicos.length) {
    throw new ErroApp(400, 'REQUISICAO_INVALIDA', 'Dados inválidos.', [
      { campo: 'problemaIds', mensagem: 'Há problema inexistente na lista.' },
    ])
  }
}

export async function listarArtigos(q: ListarArtigosQuery, u: UsuarioSessao) {
  const busca = q.busca ? normalizarBusca(q.busca) : ''
  const where: Prisma.ArtigoWhereInput = {
    AND: [
      whereVisivel(u),
      busca ? { buscaNorm: { contains: escaparLike(busca) } } : {},
      q.categoriaId === undefined ? {} : { categoriaId: q.categoriaId },
      q.problemaId === undefined ? {} : { problemas: { some: { problemaId: q.problemaId } } },
    ],
  }
  const [itens, total] = await prisma.$transaction([
    prisma.artigo.findMany({
      where,
      select: selectResumo,
      orderBy: [{ publicadoEm: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      ...paginar(q),
    }),
    prisma.artigo.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

/** Incrementa `visualizacoes` de forma atômica (update com increment) e devolve o artigo já com a contagem nova. */
export function obterArtigo(id: number, u: UsuarioSessao) {
  return prisma.$transaction(async (tx) => {
    await exigirVisivel(tx, id, u)
    await tx.artigo.updateMany({ where: { id }, data: { visualizacoes: { increment: 1 } } })
    return ler(tx, id)
  })
}

/** Sugestão por tsvector (§4.3): no máximo 5, só artigo PUBLICADO e, sem `conhecimento.verInterno`, só PUBLICO. */
export async function sugerirArtigos(q: SugestoesArtigosQuery, u: UsuarioSessao) {
  const tokens = tokensBusca(q.q)
  if (tokens.length === 0) return []
  const tsq = tokens.map((t) => `${t}:*`).join(' | ')
  const podeInterno = temPermissao(u.perfil, 'conhecimento.verInterno')
  const porProblema =
    q.problemaId === undefined
      ? Prisma.empty
      : Prisma.sql`AND EXISTS (SELECT 1 FROM artigo_problemas ap WHERE ap.artigo_id = artigos.id AND ap.problema_id = ${q.problemaId})`
  return prisma.$queryRaw<{ id: number; titulo: string; resumo: string | null }[]>`
    SELECT id, titulo, resumo
    FROM artigos, to_tsquery('portuguese', public.f_unaccent(${tsq})) q
    WHERE busca @@ q AND situacao = 'PUBLICADO' AND (visibilidade = 'PUBLICO' OR ${podeInterno}::boolean)
    ${porProblema}
    ORDER BY ts_rank_cd(busca, q) DESC, id DESC
    LIMIT 5`
}

const resumoAuditoria = (a: Awaited<ReturnType<typeof ler>>) => ({
  titulo: a.titulo,
  resumo: a.resumo,
  categoriaId: a.categoriaId,
  situacao: a.situacao,
  visibilidade: a.visibilidade,
  problemaIds: a.problemaIds,
})

export function criarArtigo(dados: CriarArtigo, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    await validarReferencias(tx, dados.categoriaId, dados.problemaIds)
    const criado = await tx.artigo.create({
      data: {
        titulo: dados.titulo,
        resumo: dados.resumo,
        conteudo: dados.conteudo,
        categoriaId: dados.categoriaId,
        situacao: dados.situacao,
        visibilidade: dados.visibilidade,
        autorId: ctx.usuario.id,
        publicadoEm: dados.situacao === 'PUBLICADO' ? new Date() : null,
      },
      select: { id: true },
    })
    const unicos = [...new Set(dados.problemaIds)]
    if (unicos.length > 0)
      await tx.artigoProblema.createMany({ data: unicos.map((problemaId) => ({ artigoId: criado.id, problemaId })) })
    const depois = await ler(tx, criado.id)
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'artigo',
      entidadeId: criado.id,
      dados: { depois: resumoAuditoria(depois) },
    })
    return depois
  })
}

export function atualizarArtigo(id: number, dados: AtualizarArtigo, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await ler(tx, id)
    await validarReferencias(tx, dados.categoriaId, dados.problemaIds)
    await tx.artigo.update({
      where: { id },
      data: {
        titulo: dados.titulo,
        resumo: dados.resumo,
        conteudo: dados.conteudo,
        categoriaId: dados.categoriaId,
        situacao: dados.situacao,
        visibilidade: dados.visibilidade,
        // `publicadoEm` só na primeira publicação
        publicadoEm: dados.situacao === 'PUBLICADO' && antes.publicadoEm === null ? new Date() : undefined,
      },
    })
    if (dados.problemaIds !== undefined) {
      const unicos = [...new Set(dados.problemaIds)]
      await tx.artigoProblema.deleteMany({ where: { artigoId: id } })
      if (unicos.length > 0)
        await tx.artigoProblema.createMany({ data: unicos.map((problemaId) => ({ artigoId: id, problemaId })) })
    }
    const depois = await ler(tx, id)
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'artigo',
      entidadeId: id,
      dados: { antes: resumoAuditoria(antes), depois: resumoAuditoria(depois) },
    })
    return depois
  })
}

export async function excluirArtigo(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await ler(tx, id)
    await tx.artigo.delete({ where: { id } })
    await auditar(tx, ctx, {
      acao: 'cadastro.excluido',
      entidade: 'artigo',
      entidadeId: id,
      dados: { antes: resumoAuditoria(antes) },
    })
  })
}

/** Um voto por usuário e artigo; só em artigo que o usuário pode ver. */
export async function votarArtigo(id: number, util: boolean, u: UsuarioSessao) {
  await prisma.$transaction(async (tx) => {
    await exigirVisivel(tx, id, u)
    await tx.artigoVoto.upsert({
      where: { artigoId_usuarioId: { artigoId: id, usuarioId: u.id } },
      create: { artigoId: id, usuarioId: u.id, util },
      update: { util },
    })
  })
}
