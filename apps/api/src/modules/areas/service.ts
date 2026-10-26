import type { AreaDestino, AtualizarArea, CriarArea, ListarAreasQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado, regraNegocio } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma, type Tx } from '../../lib/prisma'
import { selectArea } from './schemas'

/** A projeção do módulo mais os destinos (A05), com os mesmos campos do contrato. */
const selectAreaComDestinos = {
  ...selectArea,
  destinos: { select: { areaDestinoId: true, padrao: true } },
} satisfies Prisma.AreaSelect

/** Troca `areaDestinoId` por `areaId` (formato do contrato) e ordena por id para a resposta ficar estável. */
const destinosDe = <T extends { destinos: Array<{ areaDestinoId: number; padrao: boolean }> }>(a: T) => ({
  ...a,
  destinos: a.destinos.map((d) => ({ areaId: d.areaDestinoId, padrao: d.padrao })).sort((x, y) => x.areaId - y.areaId),
})

/** Destinos configurados para quem é da área `areaOrigemId`; lista vazia = nenhuma restrição (A05). */
export async function destinosDaArea(db: Pick<Tx, 'areaDestino'>, areaOrigemId: number | null) {
  if (areaOrigemId === null) return []
  return db.areaDestino.findMany({
    where: { areaOrigemId },
    select: { areaDestinoId: true, padrao: true },
    orderBy: { areaDestinoId: 'asc' },
  })
}

/** Substitui os destinos da área; cada destino precisa ser uma área ativa que atende chamados (422). */
async function gravarDestinos(tx: Tx, areaId: number, destinos: AreaDestino[]): Promise<void> {
  if (destinos.length > 0) {
    const validas = await tx.area.count({
      where: { id: { in: destinos.map((d) => d.areaId) }, ativo: true, atende: true },
    })
    if (validas !== destinos.length) throw regraNegocio('Todo destino precisa ser uma área ativa que atende chamados.')
  }
  await tx.areaDestino.deleteMany({ where: { areaOrigemId: areaId } })
  if (destinos.length > 0) {
    await tx.areaDestino.createMany({
      data: destinos.map((d) => ({ areaOrigemId: areaId, areaDestinoId: d.areaId, padrao: d.padrao })),
    })
  }
}

export async function listarAreas(q: ListarAreasQuery) {
  const where: Prisma.AreaWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const ordem: Record<ListarAreasQuery['ordem'], Prisma.AreaOrderByWithRelationInput> = {
    nome: { nome: q.direcao },
    criadoEm: { criadoEm: q.direcao },
  }
  const [itens, total] = await prisma.$transaction([
    prisma.area.findMany({
      where,
      select: selectAreaComDestinos,
      orderBy: [ordem[q.ordem], { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.area.count({ where }),
  ])
  return { itens: itens.map(destinosDe), total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterArea(id: number) {
  const area = await prisma.area.findUnique({ where: { id }, select: selectAreaComDestinos })
  if (!area) throw naoEncontrado('Área não encontrada.')
  return destinosDe(area)
}

/** Nome duplicado → P2002 → 409; jornadaId inexistente → P2003 → 422. */
export function criarArea(dados: CriarArea, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const { id } = await tx.area.create({
      data: { nome: dados.nome, atende: dados.atende, ativo: dados.ativo, jornadaId: dados.jornadaId },
      select: { id: true },
    })
    await gravarDestinos(tx, id, dados.destinos ?? [])
    const area = destinosDe(await tx.area.findUniqueOrThrow({ where: { id }, select: selectAreaComDestinos }))
    await auditar(tx, ctx, { acao: 'cadastro.criado', entidade: 'area', entidadeId: area.id, dados: { depois: area } })
    return area
  })
}

export function atualizarArea(id: number, dados: AtualizarArea, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antesBruto = await tx.area.findUnique({ where: { id }, select: selectAreaComDestinos })
    if (!antesBruto) throw naoEncontrado('Área não encontrada.')
    const antes = destinosDe(antesBruto)
    await tx.area.update({
      where: { id },
      data: { nome: dados.nome, atende: dados.atende, ativo: dados.ativo, jornadaId: dados.jornadaId },
    })
    if (dados.destinos !== undefined) await gravarDestinos(tx, id, dados.destinos)
    const depois = destinosDe(await tx.area.findUniqueOrThrow({ where: { id }, select: selectAreaComDestinos }))
    await auditar(tx, ctx, { acao: 'cadastro.alterado', entidade: 'area', entidadeId: id, dados: { antes, depois } })
    return depois
  })
}

/** Área em uso → P2003 → 409 REGISTRO_EM_USO (rollback, nada é auditado). */
export async function excluirArea(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.area.delete({ where: { id }, select: selectArea })
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'area', entidadeId: id, dados: { antes } })
  })
}
