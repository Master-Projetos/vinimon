import {
  criarMencaoRe,
  extrairMencoes,
  normalizarBusca,
  type Perfil,
  serializarMencao,
  temPermissao,
} from '@vinimon/shared'
import {
  type ChamadoEscopo,
  comAuxiliarIds,
  podeVerChamado,
  podeVerInterno,
  selectEscopo,
} from '../../autorizacao/chamados'
import type { Prisma } from '../../generated/prisma/client'
import { ErroApp, naoEncontrado } from '../../lib/erros'
import { escaparLike } from '../../lib/like'
import { prisma, type Tx } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'

/** Teto de menções distintas por mensagem (S100). */
export const MAX_MENCOES = 20
/** Teto de resultados do autocompletar. */
export const MAX_MENCIONAVEIS = 8

export interface MencaoIgnorada {
  id: number
  nome: string
}

export interface ResultadoMencoes {
  texto: string
  validos: number[]
  ignoradas: MencaoIgnorada[]
}

export interface Mencionavel {
  id: number
  nome: string
  perfil: Perfil
}

interface Candidato {
  id: number
  nome: string
  perfil: Perfil
  areaId: number | null
  areasSecundarias: { areaId: number }[]
}

/** Monta o usuário para reaproveitar `podeVerChamado`/`podeVerInterno`: a regra de escopo fica só em autorizacao/. */
function comoSessao(c: Candidato): UsuarioSessao {
  const areaIds = [...(c.areaId === null ? [] : [c.areaId]), ...c.areasSecundarias.map((a) => a.areaId)]
  return {
    id: c.id,
    nome: c.nome,
    login: '',
    perfil: c.perfil,
    areaId: c.areaId,
    areaIds,
    sessaoId: '',
    estado: 'ATIVA',
    mfaAtivo: false,
  }
}

const podeSerMencionado = (c: Candidato, chamado: ChamadoEscopo, interno: boolean): boolean => {
  const u = comoSessao(c)
  return podeVerChamado(u, chamado) && (!interno || podeVerInterno(u, chamado))
}

/**
 * S52/S100: valida as menções do texto. Quem não existe, está inativo ou não vê o chamado (nem o conteúdo interno,
 * quando `interno`) vira `@Nome` em texto simples e entra em `ignoradas`; quem vale tem o token reescrito com o nome
 * canônico do banco, nunca o digitado.
 */
export async function validarMencoes(
  tx: Tx,
  chamado: ChamadoEscopo,
  texto: string,
  interno: boolean,
): Promise<ResultadoMencoes> {
  const mencoes = extrairMencoes(texto)
  if (mencoes.length === 0) return { texto, validos: [], ignoradas: [] }
  if (mencoes.length > MAX_MENCOES) {
    const mensagem = `No máximo ${MAX_MENCOES} menções por mensagem.`
    throw new ErroApp(400, 'VALIDACAO', mensagem, [{ campo: 'texto', mensagem }])
  }

  const candidatos = await tx.usuario.findMany({
    where: { id: { in: mencoes.map((m) => m.id) }, ativo: true },
    select: {
      id: true,
      nome: true,
      perfil: true,
      areaId: true,
      areasSecundarias: { select: { areaId: true } },
    },
  })
  const validos = new Map<number, string>()
  for (const c of candidatos) {
    if (podeSerMencionado(c, chamado, interno)) validos.set(c.id, c.nome)
  }

  const ignoradas = new Map<number, MencaoIgnorada>()
  const reescrito = texto.replace(criarMencaoRe(), (_, nome: string, id: string) => {
    const nomeCanonico = validos.get(Number(id))
    if (nomeCanonico !== undefined) return serializarMencao({ id: Number(id), nome: nomeCanonico })
    if (!ignoradas.has(Number(id))) ignoradas.set(Number(id), { id: Number(id), nome })
    return `@${nome}`
  })
  return { texto: reescrito, validos: [...validos.keys()], ignoradas: [...ignoradas.values()] }
}

/** Mesmo padrão de 404 do módulo de chamados: quem não vê o chamado não descobre que ele existe. */
async function exigirVisivel(u: UsuarioSessao, id: number): Promise<ChamadoEscopo> {
  const c = comAuxiliarIds(await prisma.chamado.findUnique({ where: { id }, select: selectEscopo }))
  if (!c || !podeVerChamado(u, c)) throw naoEncontrado('Chamado não encontrado.')
  return c
}

/**
 * `GET /chamados/:id/mencionaveis`: até 8 pessoas, sem o próprio usuário, participantes primeiro. USUARIO só vê
 * participantes; `interno` limita à equipe que vê o conteúdo interno (USUARIO recebe lista vazia).
 */
export async function listarMencionaveis(
  u: UsuarioSessao,
  chamadoId: number,
  q: string,
  interno: boolean,
): Promise<Mencionavel[]> {
  const chamado = await exigirVisivel(u, chamadoId)
  if (interno && !temPermissao(u.perfil, 'chamado.verInterno')) return []

  const [seguidores, autores] = await prisma.$transaction([
    prisma.chamadoSeguidor.findMany({ where: { chamadoId }, select: { usuarioId: true } }),
    prisma.assentamento.findMany({
      where: { chamadoId, autorId: { not: null } },
      distinct: ['autorId'],
      select: { autorId: true },
    }),
  ])
  const participantes = new Set<number>([chamado.solicitanteId])
  if (chamado.operadorId !== null) participantes.add(chamado.operadorId)
  for (const s of seguidores) participantes.add(s.usuarioId)
  for (const a of autores) if (a.autorId !== null) participantes.add(a.autorId)

  const equipe = temPermissao(u.perfil, 'chamado.verArea')
  const termo = normalizarBusca(q)
  const filtros: Prisma.UsuarioWhereInput[] = [{ ativo: true }, { id: { not: u.id } }]
  if (termo) filtros.push({ buscaNorm: { contains: escaparLike(termo) } })
  filtros.push(
    equipe
      ? {
          OR: [
            { id: { in: [...participantes] } },
            { perfil: 'ADMIN' },
            { areaId: chamado.areaId },
            { areasSecundarias: { some: { areaId: chamado.areaId } } },
          ],
        }
      : { id: { in: [...participantes] } },
  )
  const candidatos = await prisma.usuario.findMany({
    where: { AND: filtros },
    orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      nome: true,
      perfil: true,
      areaId: true,
      areasSecundarias: { select: { areaId: true } },
    },
  })
  const elegiveis = candidatos.filter((c) => podeSerMencionado(c, chamado, interno))
  const ordenados = [
    ...elegiveis.filter((c) => participantes.has(c.id)),
    ...elegiveis.filter((c) => !participantes.has(c.id)),
  ]
  return ordenados.slice(0, MAX_MENCIONAVEIS).map((c) => ({ id: c.id, nome: c.nome, perfil: c.perfil }))
}
