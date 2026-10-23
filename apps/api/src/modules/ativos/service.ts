import {
  type AtualizarAtivo,
  type BuscarAtivosQuery,
  type ChamadosDoAtivoQuery,
  type CriarAtivo,
  type ListarAtivosQuery,
  normalizarBusca,
} from '@vinimon/shared'
import { escopoChamados } from '../../autorizacao/chamados'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { conflito, naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'

const selectAtivo = {
  id: true,
  etiqueta: true,
  tipoId: true,
  tipo: { select: { nome: true } },
  modelo: true,
  serie: true,
  departamentoId: true,
  departamento: { select: { nome: true } },
  responsavelId: true,
  responsavelTexto: true,
  situacao: true,
  observacao: true,
  criadoEm: true,
  atualizadoEm: true,
  _count: { select: { chamados: true } },
} satisfies Prisma.AtivoSelect

type LinhaAtivo = Prisma.AtivoGetPayload<{ select: typeof selectAtivo }>

function paraDto(a: LinhaAtivo) {
  const { tipo, departamento, _count, ...resto } = a
  return { ...resto, tipo: tipo.nome, departamento: departamento?.nome ?? null, qtdChamados: _count.chamados }
}

export async function buscarAtivos(q: BuscarAtivosQuery) {
  const busca = normalizarBusca(q.q)
  const linhas = await prisma.ativo.findMany({
    where: { buscaNorm: { contains: escaparLike(busca) } },
    select: { id: true, etiqueta: true, tipo: { select: { nome: true } } },
    orderBy: [{ etiqueta: 'asc' }, { id: 'asc' }],
    take: 10,
  })
  return linhas.map((l) => ({ id: l.id, etiqueta: l.etiqueta, tipo: l.tipo.nome }))
}

export async function listarAtivos(q: ListarAtivosQuery) {
  const busca = q.busca ? normalizarBusca(q.busca) : ''
  const where: Prisma.AtivoWhereInput = {
    AND: [
      busca ? { buscaNorm: { contains: escaparLike(busca) } } : {},
      q.tipoId === undefined ? {} : { tipoId: q.tipoId },
      q.situacao === undefined ? {} : { situacao: q.situacao },
      q.departamentoId === undefined ? {} : { departamentoId: q.departamentoId },
    ],
  }
  const [linhas, total] = await prisma.$transaction([
    prisma.ativo.findMany({ where, select: selectAtivo, orderBy: [{ etiqueta: 'asc' }, { id: 'asc' }], ...paginar(q) }),
    prisma.ativo.count({ where }),
  ])
  return { itens: linhas.map(paraDto), total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterAtivo(id: number) {
  const ativo = await prisma.ativo.findUnique({ where: { id }, select: selectAtivo })
  if (!ativo) throw naoEncontrado('Ativo não encontrado.')
  return paraDto(ativo)
}

/** Chamados do ativo, sempre dentro do escopo do usuário (S45): `AND: [escopo, filtro]`. */
export async function chamadosDoAtivo(id: number, q: ChamadosDoAtivoQuery, u: UsuarioSessao) {
  if (!(await prisma.ativo.findUnique({ where: { id }, select: { id: true } }))) {
    throw naoEncontrado('Ativo não encontrado.')
  }
  const where: Prisma.ChamadoWhereInput = { AND: [escopoChamados(u), { ativoId: id }] }
  const [itens, total] = await prisma.$transaction([
    prisma.chamado.findMany({
      where,
      select: { id: true, assunto: true, statusId: true, abertoEm: true },
      orderBy: { id: 'desc' },
      ...paginar(q),
    }),
    prisma.chamado.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

/** Etiqueta duplicada → P2002 → 409; FK inexistente → P2003 → 409 (rollback). */
export function criarAtivo(dados: CriarAtivo, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const criado = await tx.ativo.create({
      data: {
        etiqueta: dados.etiqueta,
        tipoId: dados.tipoId,
        modelo: dados.modelo,
        serie: dados.serie,
        departamentoId: dados.departamentoId,
        responsavelId: dados.responsavelId,
        responsavelTexto: dados.responsavelTexto,
        situacao: dados.situacao,
        observacao: dados.observacao,
      },
      select: selectAtivo,
    })
    const dto = paraDto(criado)
    await auditar(tx, ctx, { acao: 'cadastro.criado', entidade: 'ativo', entidadeId: dto.id, dados: { depois: dto } })
    return dto
  })
}

export function atualizarAtivo(id: number, dados: AtualizarAtivo, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.ativo.findUnique({ where: { id }, select: selectAtivo })
    if (!antes) throw naoEncontrado('Ativo não encontrado.')
    const depois = await tx.ativo.update({
      where: { id },
      data: {
        etiqueta: dados.etiqueta,
        tipoId: dados.tipoId,
        modelo: dados.modelo,
        serie: dados.serie,
        departamentoId: dados.departamentoId,
        responsavelId: dados.responsavelId,
        responsavelTexto: dados.responsavelTexto,
        situacao: dados.situacao,
        observacao: dados.observacao,
      },
      select: selectAtivo,
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'ativo',
      entidadeId: id,
      dados: { antes: paraDto(antes), depois: paraDto(depois) },
    })
    return paraDto(depois)
  })
}

export async function excluirAtivo(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.ativo.findUnique({ where: { id }, select: selectAtivo })
    if (!antes) throw naoEncontrado('Ativo não encontrado.')
    if (antes._count.chamados > 0) throw conflito('Use a situação Baixado.')
    await tx.ativo.delete({ where: { id }, select: { id: true } })
    await auditar(tx, ctx, {
      acao: 'cadastro.excluido',
      entidade: 'ativo',
      entidadeId: id,
      dados: { antes: paraDto(antes) },
    })
  })
}
