import type { AtualizarTag, CriarTag, ListarTagsQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma, type Tx } from '../../lib/prisma'
import { selectTag } from './schemas'

/** Tag não diferencia maiúsculas nem espaços nas pontas: "Rede" e " rede " são a mesma tag (CHECK ck_tags_nome). */
export const normalizarNome = (nome: string): string => nome.trim().toLowerCase()

export async function listarTags(q: ListarTagsQuery) {
  const where: Prisma.TagWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const ordem: Record<ListarTagsQuery['ordem'], Prisma.TagOrderByWithRelationInput> = {
    nome: { nome: q.direcao },
    criadoEm: { criadoEm: q.direcao },
  }
  const [itens, total] = await prisma.$transaction([
    prisma.tag.findMany({ where, select: selectTag, orderBy: [ordem[q.ordem], { id: 'asc' }], ...paginar(q) }),
    prisma.tag.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterTag(id: number) {
  const tag = await prisma.tag.findUnique({ where: { id }, select: selectTag })
  if (!tag) throw naoEncontrado('Tag não encontrada.')
  return tag
}

/** Nome duplicado (sem distinção de maiúsculas) → P2002 → 409. */
export function criarTag(dados: CriarTag, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const tag = await tx.tag.create({
      data: { nome: dados.nome, nomeNormalizado: normalizarNome(dados.nome), ativo: dados.ativo },
      select: selectTag,
    })
    await auditar(tx, ctx, { acao: 'cadastro.criado', entidade: 'tag', entidadeId: tag.id, dados: { depois: tag } })
    return tag
  })
}

export function atualizarTag(id: number, dados: AtualizarTag, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.tag.findUnique({ where: { id }, select: selectTag })
    if (!antes) throw naoEncontrado('Tag não encontrada.')
    const depois = await tx.tag.update({
      where: { id },
      data: {
        nome: dados.nome,
        nomeNormalizado: dados.nome === undefined ? undefined : normalizarNome(dados.nome),
        ativo: dados.ativo,
      },
      select: selectTag,
    })
    await auditar(tx, ctx, { acao: 'cadastro.alterado', entidade: 'tag', entidadeId: id, dados: { antes, depois } })
    return depois
  })
}

/** Tag em uso por chamado → P2003 → 409 REGISTRO_EM_USO (rollback, nada é auditado). */
export async function excluirTag(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.tag.delete({ where: { id }, select: selectTag })
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'tag', entidadeId: id, dados: { antes } })
  })
}

/**
 * Devolve o id de cada tag, criando as que faltam (usado pela T-5.8, dentro da transação do chamado).
 * Nomes repetidos (com outra caixa) contam uma vez só; a ordem segue a primeira ocorrência.
 * Não audita: quem chama registra o evento TAGS_ALTERADAS.
 */
export async function garantirTags(tx: Tx, nomes: string[]): Promise<number[]> {
  const ids: number[] = []
  const vistos = new Set<string>()
  for (const nome of nomes) {
    const nomeNormalizado = normalizarNome(nome)
    if (vistos.has(nomeNormalizado)) continue
    vistos.add(nomeNormalizado)
    const tag = await tx.tag.upsert({
      where: { nomeNormalizado },
      create: { nome: nome.trim(), nomeNormalizado },
      update: {},
      select: { id: true },
    })
    ids.push(tag.id)
  }
  return ids
}
