import { randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'
import type { MultipartFile, MultipartValue } from '@fastify/multipart'
import {
  type Anexo,
  CamposUploadSchema,
  MAX_ANEXOS_POR_CHAMADO,
  MAX_BYTES_POR_CHAMADO,
  temPermissao,
} from '@vinimon/shared'
import { type ChamadoEscopo, comEscopo, podeVerChamado, podeVerInterno } from '../../autorizacao/chamados'
import { env } from '../../env'
import type { Prisma } from '../../generated/prisma/client'
import { chaveNova, DiscoLocal } from '../../lib/armazenamento'
import { auditar } from '../../lib/auditoria'
import { obterConfig } from '../../lib/config'
import type { ContextoUsuario } from '../../lib/contexto'
import { conflito, ErroApp, naoEncontrado, regraNegocio, requisicaoInvalida, semPermissao } from '../../lib/erros'
import { prisma } from '../../lib/prisma'
import type { UsuarioSessao } from '../../lib/sessao'
import { detectarTipo, limparNomeArquivo } from '../../lib/tipo-arquivo'
import { aposCommitChamado, type LogErro, registrarEvento } from '../chamados/eventos'

const disco = new DiscoLocal(env.UPLOAD_DIR)
const DEZ_MINUTOS_MS = 10 * 60 * 1000
const MIB = 1024 * 1024

const selectAnexo = {
  id: true,
  chamadoId: true,
  assentamentoId: true,
  nomeOriginal: true,
  mime: true,
  tamanho: true,
  interno: true,
  criadoEm: true,
  enviadoPor: { select: { id: true, nome: true } },
} satisfies Prisma.AnexoSelect

const paraDto = (a: Prisma.AnexoGetPayload<{ select: typeof selectAnexo }>): Anexo => a

/**
 * S63, antes de consumir qualquer parte do stream: `anexo.enviar` e acesso ao chamado (sem acesso é 404), chamado
 * não encerrado (409), `anexos.habilitados` (403) e a cota do chamado (413). Nada toca o disco aqui.
 */
async function autorizarUpload(u: UsuarioSessao, chamadoId: number) {
  const c = comEscopo(
    await prisma.chamado.findUnique({
      where: { id: chamadoId },
      select: {
        id: true,
        areaId: true,
        operadorId: true,
        solicitanteId: true,
        statusTipo: true,
        solicitante: { select: { areaId: true } },
        auxiliares: { select: { usuarioId: true } },
      },
    }),
  )
  if (!c || !podeVerChamado(u, c)) throw naoEncontrado('Chamado não encontrado.')
  if (!temPermissao(u.perfil, 'anexo.enviar')) throw semPermissao()
  if (c.statusTipo === 'ENCERRADO') throw conflito('O chamado está encerrado e não aceita novos anexos.')
  const cfg = await obterConfig()
  if (!cfg['anexos.habilitados']) throw semPermissao('O envio de anexos está desativado.')
  const uso = await prisma.anexo.aggregate({ where: { chamadoId }, _count: { _all: true }, _sum: { tamanho: true } })
  const usados = uso._sum.tamanho ?? 0
  if (uso._count._all >= MAX_ANEXOS_POR_CHAMADO || usados >= MAX_BYTES_POR_CHAMADO)
    throw new ErroApp(413, 'ARQUIVO_GRANDE', 'O chamado atingiu o limite de anexos.')
  return {
    chamado: c,
    cfg,
    existentes: uso._count._all,
    bytesRestantes: MAX_BYTES_POR_CHAMADO - usados,
  }
}

/** Resolve `interno` e `assentamentoId` e valida ANTES do primeiro byte de arquivo (S63, T47). */
async function resolverDestino(
  u: UsuarioSessao,
  chamado: ChamadoEscopo & { id: number },
  campos: { interno: boolean; assentamentoId: number | undefined },
  agora: Date,
): Promise<{ interno: boolean; assentamentoId: number | null }> {
  if (campos.assentamentoId !== undefined) {
    const a = await prisma.assentamento.findUnique({
      where: { id: campos.assentamentoId },
      select: { chamadoId: true, autorId: true, criadoEm: true, interno: true },
    })
    if (
      !a ||
      a.chamadoId !== chamado.id ||
      a.autorId !== u.id ||
      a.criadoEm.getTime() < agora.getTime() - DEZ_MINUTOS_MS
    )
      throw regraNegocio('O comentário informado não aceita anexos (outro chamado, autor ou fora dos 10 minutos).')
    // herda o `interno` do assentamento e ignora o campo enviado
    return { interno: a.interno, assentamentoId: campos.assentamentoId }
  }
  if (campos.interno && !podeVerInterno(u, chamado)) throw semPermissao('Você não pode enviar anexo interno.')
  return { interno: campos.interno, assentamentoId: null }
}

interface Recebido {
  temporario: string
  caminhoLocal: string
  tamanho: number
  sha256: string
  nome: string
  mime: string
}

/**
 * `POST /chamados/:id/anexos` (multipart). Os campos `interno` e `assentamentoId` precisam vir antes dos arquivos.
 * Tudo é recebido para `tmp/` primeiro; só depois de todos passarem (tipo detectado, limites) os arquivos são
 * efetivados e gravados numa transação. Qualquer falha apaga os temporários: nada fica pela metade.
 */
export async function enviarAnexos(
  chamadoId: number,
  partes: AsyncIterable<MultipartFile | MultipartValue>,
  ctx: ContextoUsuario,
  log?: LogErro,
): Promise<Anexo[]> {
  const u = ctx.usuario
  const agora = new Date()
  const auth = await autorizarUpload(u, chamadoId)
  const limiteArquivo = Math.min(env.MAX_ANEXO_MB, auth.cfg['anexos.tamanhoMaxMb']) * MIB

  const brutos: Record<string, string> = {}
  let destino: { interno: boolean; assentamentoId: number | null } | null = null
  const recebidos: Recebido[] = []
  const efetivados: string[] = []
  let bytes = 0

  try {
    for await (const parte of partes) {
      if (parte.type === 'field') {
        if (destino !== null) throw requisicaoInvalida('Envie os campos antes dos arquivos.')
        if (typeof parte.value === 'string') brutos[parte.fieldname] = parte.value
        continue
      }
      if (destino === null) {
        const campos = CamposUploadSchema.safeParse(brutos)
        if (!campos.success)
          throw new ErroApp(
            400,
            'REQUISICAO_INVALIDA',
            'Dados inválidos.',
            campos.error.issues.map((i) => ({ campo: i.path.join('.') || 'campos', mensagem: i.message })),
          )
        destino = await resolverDestino(
          u,
          auth.chamado,
          { interno: campos.data.interno === 'true', assentamentoId: campos.data.assentamentoId },
          agora,
        )
      }
      if (auth.existentes + recebidos.length >= MAX_ANEXOS_POR_CHAMADO)
        throw new ErroApp(413, 'ARQUIVO_GRANDE', 'O chamado atingiu o limite de anexos.')
      const nome = limparNomeArquivo(parte.filename)
      const limite = Math.min(limiteArquivo, auth.bytesRestantes - bytes)
      const r = await disco.receber(parte.file as Readable, limite)
      recebidos.push({ ...r, nome, mime: '' })
      bytes += r.tamanho
      if (r.tamanho === 0) throw requisicaoInvalida('Arquivo vazio.')
      const tipo = await detectarTipo(r.caminhoLocal, nome)
      if (!tipo) throw new ErroApp(415, 'TIPO_ARQUIVO_INVALIDO', 'Tipo de arquivo não permitido.')
      const atual = recebidos.at(-1)
      if (atual) atual.mime = tipo.mime
    }
    if (recebidos.length === 0 || destino === null) throw requisicaoInvalida('Nenhum arquivo enviado.')
    const alvo = destino

    const criados = await prisma.$transaction(async (tx) => {
      const lista: Anexo[] = []
      for (const r of recebidos) {
        const id = randomUUID()
        const chave = chaveNova(agora, id)
        await disco.efetivar(r.temporario, chave)
        efetivados.push(chave)
        const a = await tx.anexo.create({
          data: {
            id,
            chamadoId,
            assentamentoId: alvo.assentamentoId,
            enviadoPorId: u.id,
            nomeOriginal: r.nome,
            mime: r.mime,
            tamanho: r.tamanho,
            sha256: r.sha256,
            storageChave: chave,
            interno: alvo.interno,
          },
          select: selectAnexo,
        })
        lista.push(paraDto(a))
      }
      const evento = await registrarEvento(tx, {
        chamadoId,
        tipo: 'ANEXO_ADICIONADO',
        atorId: u.id,
        interno: alvo.interno,
        dados: { anexoIds: lista.map((a) => a.id), quantidade: lista.length },
      })
      // `ultimaAtividadeEm` só muda em evento público (S49)
      if (!alvo.interno) await tx.chamado.update({ where: { id: chamadoId }, data: { ultimaAtividadeEm: agora } })
      return { lista, evento }
    })
    efetivados.length = 0 // gravados: não devem ser removidos no catch
    await aposCommitChamado({
      chamadoId,
      eventoIds: [criados.evento],
      assentamentoIds: [],
      campos: ['anexos'],
      acessoMudou: false,
      fila: null,
      ...(log ? { log } : {}),
    })
    return criados.lista
  } catch (erro) {
    // arquivos já efetivados cuja transação falhou não podem ficar órfãos
    await Promise.all(efetivados.map((chave) => disco.remover(chave)))
    throw erro
  } finally {
    await Promise.all(recebidos.map((r) => disco.descartar(r.temporario)))
  }
}

/** `GET /chamados/:id/anexos`: o interno só aparece para quem passa em `podeVerInterno` (S71). */
export async function listarAnexos(chamadoId: number, u: UsuarioSessao): Promise<Anexo[]> {
  const c = comEscopo(
    await prisma.chamado.findUnique({
      where: { id: chamadoId },
      select: {
        areaId: true,
        operadorId: true,
        solicitanteId: true,
        solicitante: { select: { areaId: true } },
        auxiliares: { select: { usuarioId: true } },
      },
    }),
  )
  if (!c || !podeVerChamado(u, c)) throw naoEncontrado('Chamado não encontrado.')
  const linhas = await prisma.anexo.findMany({
    where: { chamadoId, ...(podeVerInterno(u, c) ? {} : { interno: false }) },
    select: selectAnexo,
    orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
  })
  return linhas.map(paraDto)
}

const IMAGENS_INLINE: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

/** `GET /anexos/:id`: fora do escopo, e interno sem acesso, dão 404 (S71). */
export async function abrirAnexo(id: string, u: UsuarioSessao) {
  const a = await prisma.anexo.findUnique({
    where: { id },
    select: {
      mime: true,
      nomeOriginal: true,
      storageChave: true,
      interno: true,
      chamado: {
        select: {
          areaId: true,
          operadorId: true,
          solicitanteId: true,
          solicitante: { select: { areaId: true } },
          auxiliares: { select: { usuarioId: true } },
        },
      },
    },
  })
  const escopo = a ? comEscopo(a.chamado) : null
  if (!a || !escopo || !podeVerChamado(u, escopo) || (a.interno && !podeVerInterno(u, escopo)))
    throw naoEncontrado('Anexo não encontrado.')
  return {
    mime: a.mime,
    nome: a.nomeOriginal,
    inline: IMAGENS_INLINE.has(a.mime),
    stream: disco.abrirLeitura(a.storageChave),
  }
}

/** `DELETE /anexos/:id` (ADMIN): remove a linha, audita, registra o evento e só então apaga o arquivo. */
export async function excluirAnexo(id: string, ctx: ContextoUsuario, log?: LogErro): Promise<void> {
  const r = await prisma.$transaction(async (tx) => {
    const a = await tx.anexo.findUnique({
      where: { id },
      select: { chamadoId: true, interno: true, storageChave: true, nomeOriginal: true, mime: true, tamanho: true },
    })
    if (!a) throw naoEncontrado('Anexo não encontrado.')
    await tx.anexo.delete({ where: { id } })
    await auditar(tx, ctx, {
      acao: 'anexo.excluido',
      entidade: 'anexo',
      entidadeId: id,
      dados: {
        antes: { chamadoId: a.chamadoId, nome: a.nomeOriginal, mime: a.mime, tamanho: a.tamanho, interno: a.interno },
      },
    })
    const evento = await registrarEvento(tx, {
      chamadoId: a.chamadoId,
      tipo: 'ANEXO_REMOVIDO',
      atorId: ctx.usuario.id,
      interno: a.interno,
      dados: { anexoId: id },
    })
    return { a, evento }
  })
  await disco.remover(r.a.storageChave)
  await aposCommitChamado({
    chamadoId: r.a.chamadoId,
    eventoIds: [r.evento],
    assentamentoIds: [],
    campos: ['anexos'],
    acessoMudou: false,
    fila: null,
    ...(log ? { log } : {}),
  })
}
