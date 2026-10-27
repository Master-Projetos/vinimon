import type {
  AtualizarListaEmail,
  CriarListaEmail,
  ListarListasEmailQuery,
  VincularListasModelo,
} from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { ErroApp, naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'
import { selectListaEmail } from './schemas'

/** Nome duplicado → P2002 → 409 (rollback, nada é auditado). Excluir tira a lista dos modelos na mesma transação. */
export async function listarListasEmail(q: ListarListasEmailQuery) {
  const where: Prisma.ListaEmailWhereInput = q.busca
    ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' } }
    : {}
  const [itens, total] = await prisma.$transaction([
    prisma.listaEmail.findMany({
      where,
      select: selectListaEmail,
      orderBy: [{ nome: q.direcao }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.listaEmail.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterListaEmail(id: number) {
  const lista = await prisma.listaEmail.findUnique({ where: { id }, select: selectListaEmail })
  if (!lista) throw naoEncontrado('Lista de distribuição não encontrada.')
  return lista
}

export function criarListaEmail(dados: CriarListaEmail, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const lista = await tx.listaEmail.create({ data: dados, select: selectListaEmail })
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'lista_email',
      entidadeId: lista.id,
      dados: { depois: lista },
    })
    return lista
  })
}

export function atualizarListaEmail(id: number, dados: AtualizarListaEmail, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.listaEmail.findUnique({ where: { id }, select: selectListaEmail })
    if (!antes) throw naoEncontrado('Lista de distribuição não encontrada.')
    const depois = await tx.listaEmail.update({ where: { id }, data: dados, select: selectListaEmail })
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'lista_email',
      entidadeId: id,
      dados: { antes, depois },
    })
    return depois
  })
}

export async function excluirListaEmail(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.listaEmail.delete({ where: { id }, select: selectListaEmail })
    // Sem FK no array: tira o id de todos os modelos que o referenciam, na mesma transação.
    await tx.$executeRaw`UPDATE modelos_email SET lista_ids = array_remove(lista_ids, ${id}) WHERE ${id} = ANY(lista_ids)`
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'lista_email', entidadeId: id, dados: { antes } })
  })
}

/** Substitui as listas vinculadas ao modelo. Ids inexistentes → 400 com `detalhes` em `listaIds`. */
export function vincularListasModelo(evento: string, dados: VincularListasModelo, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.modeloEmail.findUnique({ where: { evento }, select: { evento: true, listaIds: true } })
    if (!antes) throw naoEncontrado('Modelo de e-mail não encontrado.')
    if (dados.listaIds.length > 0) {
      const existentes = await tx.listaEmail.findMany({ where: { id: { in: dados.listaIds } }, select: { id: true } })
      const ids = new Set(existentes.map((l) => l.id))
      const faltantes = dados.listaIds.filter((id) => !ids.has(id))
      if (faltantes.length > 0) {
        throw new ErroApp(400, 'VALIDACAO', 'Lista de distribuição não encontrada.', [
          { campo: 'listaIds', mensagem: `Listas inexistentes: ${faltantes.join(', ')}.` },
        ])
      }
    }
    const listaIds = [...dados.listaIds].sort((a, b) => a - b)
    const depois = await tx.modeloEmail.update({
      where: { evento },
      data: { listaIds },
      select: { evento: true, listaIds: true },
    })
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'modelo_email',
      entidadeId: evento,
      dados: { antes, depois },
    })
    return depois
  })
}
