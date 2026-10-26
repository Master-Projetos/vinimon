import type {
  AtualizarUsuario,
  BuscarUsuariosQuery,
  CriarUsuario,
  ListarUsuariosQuery,
  Usuario,
  UsuarioBusca,
} from '@vinimon/shared'
import { normalizarBusca } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { conflito, naoEncontrado, regraNegocio } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma, type Tx } from '../../lib/prisma'
import { hashSenha, senhaAleatoria } from '../../lib/senha'
import { desconectarSessoes, type MotivoRevogacao, revogarSessoesDoUsuario } from '../../lib/sessao'
import { tempoReal } from '../../lib/tempo-real'
import { selectUsuario, selectUsuarioBusca } from './schemas'

type LinhaUsuario = Prisma.UsuarioGetPayload<{ select: typeof selectUsuario }>

function paraUsuario(u: LinhaUsuario): Usuario {
  const { areasSecundarias, areasGeridas, mfaAtivadoEm, ...resto } = u
  return {
    ...resto,
    mfaAtivo: mfaAtivadoEm !== null,
    areaSecundariaIds: areasSecundarias.map((a) => a.areaId),
    areasGeridasIds: areasGeridas.map((a) => a.areaId),
  }
}

/** Visão para auditoria: só dados cadastrais, nunca segredos. */
function paraAuditoria(u: Usuario) {
  const { criadoEm: _criadoEm, atualizadoEm: _atualizadoEm, ultimoLoginEm: _ultimoLoginEm, area: _area, ...resto } = u
  return resto
}

const mesmaLista = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',')

/** OPERADOR exige área primária que atende (422). */
async function validarAreaOperador(tx: Tx, perfil: string, areaId: number | null) {
  if (perfil !== 'OPERADOR') return
  if (areaId === null) throw regraNegocio('Operador precisa de uma área principal.')
  const area = await tx.area.findUnique({ where: { id: areaId }, select: { atende: true } })
  if (!area?.atende) throw regraNegocio('A área principal do operador precisa ser uma área que atende chamados.')
}

/**
 * Gerente de área (A04): USUARIO só gerencia área que não atende; OPERADOR e ADMIN, só áreas entre as suas.
 * Retorna as áreas válidas. Se o corpo trouxe uma lista com área inválida, é 422; se a lista apenas ficou
 * inválida por mudança de perfil ou de áreas, as inválidas saem (nunca sobra privilégio sem base).
 */
async function areasGeridasValidas(
  tx: Tx,
  perfil: string,
  areaIds: readonly number[],
  pedidas: readonly number[],
  explicito: boolean,
): Promise<number[]> {
  if (pedidas.length === 0) return []
  const areas = await tx.area.findMany({ where: { id: { in: [...pedidas] } }, select: { id: true, atende: true } })
  const validas = pedidas.filter((id) => {
    const area = areas.find((a) => a.id === id)
    if (!area) return false
    return perfil === 'USUARIO' ? !area.atende : areaIds.includes(id)
  })
  if (explicito && validas.length !== pedidas.length) {
    throw regraNegocio(
      perfil === 'USUARIO'
        ? 'Usuário comum só pode gerenciar áreas que não atendem chamados.'
        : 'Só é possível gerenciar áreas entre as áreas do próprio usuário.',
    )
  }
  return validas
}

export async function listarUsuarios(q: ListarUsuariosQuery) {
  const busca = q.busca ? normalizarBusca(q.busca) : ''
  const where: Prisma.UsuarioWhereInput = {
    ...(busca ? { buscaNorm: { contains: escaparLike(busca) } } : {}),
    ...(q.perfil === undefined ? {} : { perfil: q.perfil }),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
    ...(q.areaId === undefined ? {} : { areaId: q.areaId }),
  }
  const [linhas, total] = await prisma.$transaction([
    prisma.usuario.findMany({
      where,
      select: selectUsuario,
      orderBy: [{ nome: q.direcao }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.usuario.count({ where }),
  ])
  return { itens: linhas.map(paraUsuario), total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterUsuario(id: number) {
  const u = await prisma.usuario.findUnique({ where: { id }, select: selectUsuario })
  if (!u) throw naoEncontrado('Usuário não encontrado.')
  return paraUsuario(u)
}

/** Diretório de usuários (S51): só ativos, até 20, `login` apenas para ADMIN. */
export async function buscarUsuarios(q: BuscarUsuariosQuery, ctx: ContextoUsuario): Promise<UsuarioBusca[]> {
  const termo = normalizarBusca(q.q)
  if (termo.length < 2) return []
  const linhas = await prisma.usuario.findMany({
    where: { ativo: true, buscaNorm: { contains: escaparLike(termo) } },
    select: selectUsuarioBusca,
    orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    take: 20,
  })
  const admin = ctx.usuario.perfil === 'ADMIN'
  return linhas.map((u) => ({
    id: u.id,
    nome: u.nome,
    areaNome: u.area?.nome ?? null,
    ...(admin ? { login: u.login } : {}),
  }))
}

/** Login ou e-mail repetido → P2002 → 409; área/departamento inexistente → P2003 → 422. */
export async function criarUsuario(dados: CriarUsuario, ctx: ContextoUsuario) {
  const senhaTemporaria = senhaAleatoria(16)
  const senhaHash = await hashSenha(senhaTemporaria)
  const usuario = await prisma.$transaction(async (tx) => {
    const areaId = dados.areaId ?? null
    await validarAreaOperador(tx, dados.perfil, areaId)
    const criado = await tx.usuario.create({
      data: {
        login: dados.login,
        nome: dados.nome,
        email: dados.email ?? null,
        telefone: dados.telefone ?? null,
        perfil: dados.perfil,
        areaId,
        departamentoId: dados.departamentoId ?? null,
        ativo: dados.ativo,
        senhaHash,
        deveTrocarSenha: true,
        areasSecundarias: { create: dados.areaSecundariaIds.map((areaSecId) => ({ areaId: areaSecId })) },
      },
      select: selectUsuario,
    })
    const visao = paraUsuario(criado)
    await auditar(tx, ctx, {
      acao: 'usuario.criado',
      entidade: 'usuario',
      entidadeId: criado.id,
      dados: { depois: paraAuditoria(visao) },
    })
    return visao
  })
  return { usuario, senhaTemporaria }
}

export async function atualizarUsuario(id: number, dados: AtualizarUsuario, ctx: ContextoUsuario) {
  const r = await prisma.$transaction(async (tx) => {
    // Serializa alterações de perfil/ativo para a contagem do último ADMIN valer dentro da transação.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('usuarios.ultimo_admin'))`
    const linhaAntes = await tx.usuario.findUnique({ where: { id }, select: selectUsuario })
    if (!linhaAntes) throw naoEncontrado('Usuário não encontrado.')
    const antes = paraUsuario(linhaAntes)

    const perfil = dados.perfil ?? antes.perfil
    const ativo = dados.ativo ?? antes.ativo
    const areaId = dados.areaId === undefined ? antes.areaId : dados.areaId
    const secundarias = dados.areaSecundariaIds ?? antes.areaSecundariaIds
    const mudouPerfil = perfil !== antes.perfil
    const mudouAtivo = ativo !== antes.ativo

    if (id === ctx.usuario.id && (mudouPerfil || mudouAtivo)) {
      throw conflito('Você não pode alterar o próprio perfil nem desativar a própria conta.')
    }
    if (antes.perfil === 'ADMIN' && antes.ativo && (perfil !== 'ADMIN' || !ativo)) {
      const outros = await tx.usuario.count({ where: { perfil: 'ADMIN', ativo: true, id: { not: id } } })
      if (outros === 0) throw conflito('Não é possível remover o último administrador ativo.')
    }
    await validarAreaOperador(tx, perfil, areaId)

    const todasAreas = [...(areaId === null ? [] : [areaId]), ...secundarias]
    const geridas = await areasGeridasValidas(
      tx,
      perfil,
      todasAreas,
      dados.areasGeridasIds ?? antes.areasGeridasIds,
      dados.areasGeridasIds !== undefined,
    )
    const mudouGeridas = !mesmaLista(geridas, antes.areasGeridasIds)
    if (mudouGeridas) {
      await tx.areaGerente.deleteMany({ where: { usuarioId: id } })
      await tx.areaGerente.createMany({
        data: geridas.map((areaGeridaId) => ({ usuarioId: id, areaId: areaGeridaId })),
      })
    }

    const mudouAreas = !mesmaLista(secundarias, antes.areaSecundariaIds)
    if (dados.areaSecundariaIds !== undefined && mudouAreas) {
      await tx.usuarioArea.deleteMany({ where: { usuarioId: id } })
      await tx.usuarioArea.createMany({ data: secundarias.map((areaSecId) => ({ usuarioId: id, areaId: areaSecId })) })
    }
    const linhaDepois = await tx.usuario.update({
      where: { id },
      data: {
        login: dados.login,
        nome: dados.nome,
        email: dados.email,
        telefone: dados.telefone,
        perfil: dados.perfil,
        areaId: dados.areaId,
        departamentoId: dados.departamentoId,
        ativo: dados.ativo,
      },
      select: selectUsuario,
    })
    const depois = paraUsuario(linhaDepois)
    const revogar = mudouPerfil || areaId !== antes.areaId || mudouAreas || (dados.ativo === false && mudouAtivo)
    const motivo: MotivoRevogacao = ativo ? 'perfil_alterado' : 'usuario_desativado'
    const sessoes = revogar ? await revogarSessoesDoUsuario(tx, id, motivo) : []
    await auditar(tx, ctx, {
      acao: 'usuario.alterado',
      entidade: 'usuario',
      entidadeId: id,
      dados: { antes: paraAuditoria(antes), depois: paraAuditoria(depois) },
    })
    return { depois, sessoes, motivo }
  })
  // Efeitos só depois do commit.
  desconectarSessoes(r.sessoes, r.motivo)
  tempoReal.revalidarUsuario(id)
  return r.depois
}
