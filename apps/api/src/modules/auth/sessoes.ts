import type { SessaoDispositivo } from '@vinimon/shared'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { naoEncontrado } from '../../lib/erros'
import { prisma } from '../../lib/prisma'
import { desconectarSessoes, revogarSessao, revogarSessoesDoUsuario } from '../../lib/sessao'

/** Sessões ativas do usuário, a mais recente primeiro. */
export async function listarSessoes(ctx: ContextoUsuario): Promise<SessaoDispositivo[]> {
  const linhas = await prisma.sessao.findMany({
    where: { usuarioId: ctx.usuario.id, revogadaEm: null, expiraEm: { gt: new Date() } },
    orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
    select: { id: true, criadaEm: true, ultimoUsoEm: true, ip: true, userAgent: true },
  })
  return linhas.map((s) => ({ ...s, atual: s.id === ctx.usuario.sessaoId }))
}

/** Sessão de outra pessoa (ou inexistente, ou já revogada) dá 404 igual, sem revelar nada. */
export async function revogarDispositivo(id: string, ctx: ContextoUsuario): Promise<void> {
  const s = await prisma.sessao.findFirst({
    where: { id, usuarioId: ctx.usuario.id, revogadaEm: null },
    select: { id: true },
  })
  if (!s) throw naoEncontrado('Sessão não encontrada.')
  await revogarSessao(id, 'logout')
  await prisma.$transaction((tx) => auditar(tx, ctx, { acao: 'sessao.revogada', entidade: 'sessao', entidadeId: id }))
}

/** Revoga todas as sessões, inclusive a atual. */
export async function encerrarTodas(ctx: ContextoUsuario): Promise<void> {
  const ids = await prisma.$transaction(async (tx) => {
    await auditar(tx, ctx, { acao: 'sessao.encerrar_todas', entidade: 'usuario', entidadeId: ctx.usuario.id })
    return revogarSessoesDoUsuario(tx, ctx.usuario.id, 'encerrar_todas')
  })
  desconectarSessoes(ids, 'encerrar_todas')
}
