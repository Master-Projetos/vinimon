import {
  type AplicaveisQuery,
  type AtualizarCampoPersonalizado,
  type CriarCampoPersonalizado,
  CriarCampoPersonalizadoSchema,
  type ListarCamposPersonalizadosQuery,
} from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { ErroApp, naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma } from '../../lib/prisma'

const selectCampo = {
  id: true,
  chave: true,
  rotulo: true,
  tipo: true,
  opcoes: true,
  obrigatorio: true,
  regex: true,
  ajuda: true,
  visibilidade: true,
  ordem: true,
  ativo: true,
  problemas: { select: { problemaId: true, obrigatorio: true }, orderBy: { problemaId: 'asc' } },
} satisfies Prisma.CampoPersonalizadoSelect

export async function listarCampos(q: ListarCamposPersonalizadosQuery) {
  const where: Prisma.CampoPersonalizadoWhereInput = {
    ...(q.busca
      ? {
          OR: [
            { rotulo: { contains: escaparLike(q.busca), mode: 'insensitive' as const } },
            { chave: { contains: escaparLike(q.busca), mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const [itens, total] = await prisma.$transaction([
    prisma.campoPersonalizado.findMany({
      where,
      select: selectCampo,
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.campoPersonalizado.count({ where }),
  ])
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterCampo(id: number) {
  const campo = await prisma.campoPersonalizado.findUnique({ where: { id }, select: selectCampo })
  if (!campo) throw naoEncontrado('Campo personalizado não encontrado.')
  return campo
}

/** Campos que valem para o problema (sem vínculos = vale para todos), com `obrigatorio` já resolvido. */
export async function listarAplicaveis(q: AplicaveisQuery, ctx: ContextoUsuario) {
  const where: Prisma.CampoPersonalizadoWhereInput = {
    ativo: true,
    ...(ctx.usuario.perfil === 'USUARIO' ? { visibilidade: { not: 'OCULTO_SOLICITANTE' } } : {}),
    OR:
      q.problemaId === undefined
        ? [{ problemas: { none: {} } }]
        : [{ problemas: { none: {} } }, { problemas: { some: { problemaId: q.problemaId } } }],
  }
  const campos = await prisma.campoPersonalizado.findMany({
    where,
    select: { ...selectCampo, problemas: { select: { problemaId: true, obrigatorio: true } } },
    orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
  })
  return campos.map(({ problemas, ...campo }) => {
    const vinculo = problemas.find((p) => p.problemaId === q.problemaId)
    return { ...campo, obrigatorio: vinculo?.obrigatorio ?? campo.obrigatorio }
  })
}

export function criarCampo(dados: CriarCampoPersonalizado, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const { id } = await tx.campoPersonalizado.create({
      data: {
        chave: dados.chave,
        rotulo: dados.rotulo,
        tipo: dados.tipo,
        opcoes: dados.opcoes,
        obrigatorio: dados.obrigatorio,
        regex: dados.regex,
        ajuda: dados.ajuda,
        visibilidade: dados.visibilidade,
        ordem: dados.ordem,
        ativo: dados.ativo,
      },
      select: { id: true },
    })
    if (dados.problemas.length > 0) {
      await tx.campoProblema.createMany({
        data: dados.problemas.map((p) => ({ campoId: id, problemaId: p.problemaId, obrigatorio: p.obrigatorio })),
      })
    }
    const campo = await tx.campoPersonalizado.findUniqueOrThrow({ where: { id }, select: selectCampo })
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'campo_personalizado',
      entidadeId: id,
      dados: { depois: campo },
    })
    return campo
  })
}

export function atualizarCampo(id: number, dados: AtualizarCampoPersonalizado, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.campoPersonalizado.findUnique({ where: { id }, select: selectCampo })
    if (!antes) throw naoEncontrado('Campo personalizado não encontrado.')

    // Regras entre campos valem para o resultado final, não só para o que veio no corpo.
    const final = CriarCampoPersonalizadoSchema.safeParse({
      chave: antes.chave,
      rotulo: dados.rotulo ?? antes.rotulo,
      tipo: dados.tipo ?? antes.tipo,
      opcoes: dados.opcoes ?? antes.opcoes,
      obrigatorio: dados.obrigatorio ?? antes.obrigatorio,
      regex: dados.regex === undefined ? antes.regex : dados.regex,
      ajuda: dados.ajuda === undefined ? antes.ajuda : dados.ajuda,
      visibilidade: dados.visibilidade ?? antes.visibilidade,
      ordem: dados.ordem ?? antes.ordem,
      ativo: dados.ativo ?? antes.ativo,
      problemas: dados.problemas ?? antes.problemas,
    })
    if (!final.success) {
      throw new ErroApp(
        400,
        'VALIDACAO',
        'Verifique os campos informados.',
        final.error.issues.map((i) => ({ campo: i.path.join('.') || 'corpo', mensagem: i.message })),
      )
    }

    await tx.campoPersonalizado.update({
      where: { id },
      data: {
        rotulo: dados.rotulo,
        tipo: dados.tipo,
        opcoes: dados.opcoes,
        obrigatorio: dados.obrigatorio,
        regex: dados.regex,
        ajuda: dados.ajuda,
        visibilidade: dados.visibilidade,
        ordem: dados.ordem,
        ativo: dados.ativo,
      },
    })
    if (dados.problemas !== undefined) {
      await tx.campoProblema.deleteMany({ where: { campoId: id } })
      if (dados.problemas.length > 0) {
        await tx.campoProblema.createMany({
          data: dados.problemas.map((p) => ({ campoId: id, problemaId: p.problemaId, obrigatorio: p.obrigatorio })),
        })
      }
    }
    const depois = await tx.campoPersonalizado.findUniqueOrThrow({ where: { id }, select: selectCampo })
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'campo_personalizado',
      entidadeId: id,
      dados: { antes, depois },
    })
    return depois
  })
}

/** Campo com valores gravados → P2003 → 409 REGISTRO_EM_USO (desative em vez de excluir). */
export async function excluirCampo(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const antes = await tx.campoPersonalizado.findUnique({ where: { id }, select: selectCampo })
    if (!antes) throw naoEncontrado('Campo personalizado não encontrado.')
    await tx.campoPersonalizado.delete({ where: { id } })
    await auditar(tx, ctx, {
      acao: 'cadastro.excluido',
      entidade: 'campo_personalizado',
      entidadeId: id,
      dados: { antes },
    })
  })
}
