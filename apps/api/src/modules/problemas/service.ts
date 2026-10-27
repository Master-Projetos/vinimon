import type { AtualizarProblema, CriarProblema, ListarProblemasQuery } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { type DetalheErro, ErroApp, naoEncontrado, regraNegocio } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { paginar } from '../../lib/paginacao'
import { prisma, type Tx } from '../../lib/prisma'
import { selectProblema as selectBase } from './schemas'

/** A projeção do módulo mais as três categorias (B07). */
const selectProblema = {
  ...selectBase,
  categoria1Id: true,
  categoria2Id: true,
  categoria3Id: true,
} satisfies Prisma.ProblemaSelect

type LinhaProblema = Prisma.ProblemaGetPayload<{ select: typeof selectProblema }>

/** Achata ProblemaArea → areas:[{id,nome}] na resposta. */
function paraResposta({ areas, ...resto }: LinhaProblema) {
  return { ...resto, areas: areas.map((a) => a.area) }
}

/** Todas as áreas precisam atender (senão 422). Área inexistente cai na FK (422 REFERENCIA_INVALIDA). */
async function validarAreasQueAtendem(tx: Tx, areaIds: number[]): Promise<void> {
  const areas = await tx.area.findMany({ where: { id: { in: areaIds } }, select: { nome: true, atende: true } })
  const naoAtendem = areas.filter((a) => !a.atende).map((a) => a.nome)
  if (naoAtendem.length > 0) {
    throw regraNegocio(`Estas áreas não atendem chamados: ${naoAtendem.join(', ')}.`)
  }
}

type IdsCategoria = { categoria1Id?: number | null; categoria2Id?: number | null; categoria3Id?: number | null }

/** Categoria N precisa existir e ser do grupo N (senão 422). */
async function validarCategorias(tx: Tx, ids: IdsCategoria): Promise<void> {
  const pares = [
    [1, ids.categoria1Id],
    [2, ids.categoria2Id],
    [3, ids.categoria3Id],
  ] as const
  for (const [grupo, id] of pares) {
    if (id === null || id === undefined) continue
    const ok = await tx.categoria.count({ where: { id, grupo } })
    if (ok === 0) throw regraNegocio(`A categoria ${grupo} precisa ser uma categoria do grupo ${grupo}.`)
  }
}

export async function listarProblemas(q: ListarProblemasQuery) {
  const where: Prisma.ProblemaWhereInput = {
    ...(q.busca ? { nome: { contains: escaparLike(q.busca), mode: 'insensitive' as const } } : {}),
    ...(q.ativo === undefined ? {} : { ativo: q.ativo }),
  }
  const [linhas, total] = await prisma.$transaction([
    prisma.problema.findMany({
      where,
      select: selectProblema,
      orderBy: [{ nome: q.direcao }, { id: 'asc' }],
      ...paginar(q),
    }),
    prisma.problema.count({ where }),
  ])
  return { itens: linhas.map(paraResposta), total, pagina: q.pagina, porPagina: q.porPagina }
}

export async function obterProblema(id: number) {
  const linha = await prisma.problema.findUnique({ where: { id }, select: selectProblema })
  if (!linha) throw naoEncontrado('Problema não encontrado.')
  return paraResposta(linha)
}

/** Nome duplicado → P2002 → 409; área inexistente → P2003 → 422. */
export function criarProblema(dados: CriarProblema, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    await validarAreasQueAtendem(tx, dados.areaIds)
    await validarCategorias(tx, dados)
    const criado = await tx.problema.create({
      data: {
        nome: dados.nome,
        descricao: dados.descricao,
        areaPadraoId: dados.areaPadraoId,
        slaRespostaMin: dados.slaRespostaMin,
        slaSolucaoMin: dados.slaSolucaoMin,
        ativo: dados.ativo,
        categoria1Id: dados.categoria1Id,
        categoria2Id: dados.categoria2Id,
        categoria3Id: dados.categoria3Id,
        areas: { create: dados.areaIds.map((areaId) => ({ areaId })) },
      },
      select: selectProblema,
    })
    const problema = paraResposta(criado)
    await auditar(tx, ctx, {
      acao: 'cadastro.criado',
      entidade: 'problema',
      entidadeId: problema.id,
      dados: { depois: problema },
    })
    return problema
  })
}

/** Troca de áreas: apaga todas as ProblemaArea e grava as novas, na mesma transação. */
export function atualizarProblema(id: number, dados: AtualizarProblema, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.problema.findUnique({ where: { id }, select: selectProblema })
    if (!anterior) throw naoEncontrado('Problema não encontrado.')
    const antes = paraResposta(anterior)

    const areaIds = dados.areaIds ?? antes.areas.map((a) => a.id)
    const areaPadraoId = dados.areaPadraoId === undefined ? antes.areaPadraoId : dados.areaPadraoId
    if (areaPadraoId !== null && !areaIds.includes(areaPadraoId)) {
      const detalhes: DetalheErro[] = [
        { campo: 'areaPadraoId', mensagem: 'A área padrão precisa estar entre as áreas do problema.' },
      ]
      throw new ErroApp(400, 'VALIDACAO', 'Verifique os campos informados.', detalhes)
    }

    await validarCategorias(tx, dados)
    if (dados.areaIds !== undefined) {
      await validarAreasQueAtendem(tx, dados.areaIds)
      await tx.problemaArea.deleteMany({ where: { problemaId: id } })
      await tx.problemaArea.createMany({ data: dados.areaIds.map((areaId) => ({ problemaId: id, areaId })) })
    }

    const depois = paraResposta(
      await tx.problema.update({
        where: { id },
        data: {
          nome: dados.nome,
          descricao: dados.descricao,
          areaPadraoId: dados.areaPadraoId,
          slaRespostaMin: dados.slaRespostaMin,
          slaSolucaoMin: dados.slaSolucaoMin,
          ativo: dados.ativo,
          categoria1Id: dados.categoria1Id,
          categoria2Id: dados.categoria2Id,
          categoria3Id: dados.categoria3Id,
        },
        select: selectProblema,
      }),
    )
    await auditar(tx, ctx, {
      acao: 'cadastro.alterado',
      entidade: 'problema',
      entidadeId: id,
      dados: { antes, depois },
    })
    return depois
  })
}

/** Problema em uso por chamado → P2003 → 409 REGISTRO_EM_USO (rollback, nada é auditado). */
export async function excluirProblema(id: number, ctx: ContextoUsuario) {
  await prisma.$transaction(async (tx) => {
    const anterior = await tx.problema.findUnique({ where: { id }, select: selectProblema })
    if (!anterior) throw naoEncontrado('Problema não encontrado.')
    const antes = paraResposta(anterior)
    await tx.problema.delete({ where: { id }, select: { id: true } })
    await auditar(tx, ctx, { acao: 'cadastro.excluido', entidade: 'problema', entidadeId: id, dados: { antes } })
  })
}
