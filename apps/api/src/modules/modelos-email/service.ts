import { randomUUID } from 'node:crypto'
import type { AtualizarModeloEmail, EnviarTesteEmail, EventoEmail } from '@vinimon/shared'
import type { Prisma } from '../../generated/prisma/client'
import { auditar } from '../../lib/auditoria'
import type { ContextoUsuario } from '../../lib/contexto'
import { despacharEmail, enfileirarEmail } from '../../lib/email'
import { naoEncontrado } from '../../lib/erros'
import { prisma, type Tx } from '../../lib/prisma'
import { render } from './render'

/** Projeção única do módulo (nunca devolva a linha inteira). */
export const selectModeloEmail = {
  evento: true,
  assunto: true,
  corpoTexto: true,
  ativo: true,
  atualizadoEm: true,
} satisfies Prisma.ModeloEmailSelect

export function listarModelosEmail() {
  return prisma.modeloEmail.findMany({ select: selectModeloEmail, orderBy: { evento: 'asc' } })
}

export async function obterModeloEmail(evento: string) {
  const modelo = await prisma.modeloEmail.findUnique({ where: { evento }, select: selectModeloEmail })
  if (!modelo) throw naoEncontrado('Modelo de e-mail não encontrado.')
  return modelo
}

export function atualizarModeloEmail(evento: string, dados: AtualizarModeloEmail, ctx: ContextoUsuario) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.modeloEmail.findUnique({ where: { evento }, select: selectModeloEmail })
    if (!antes) throw naoEncontrado('Modelo de e-mail não encontrado.')
    const depois = await tx.modeloEmail.update({
      where: { evento },
      data: { assunto: dados.assunto, corpoTexto: dados.corpoTexto, ativo: dados.ativo },
      select: selectModeloEmail,
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

/** Envio de teste: grava na outbox, depois do commit agenda o job de envio. Não depende do modelo salvo. */
export async function enviarTesteEmail(dados: EnviarTesteEmail): Promise<{ id: number }> {
  const { assunto, texto, html } = render(
    {
      assunto: 'Teste de e-mail do Vinimon',
      corpoTexto:
        'Este é um e-mail de teste enviado pelo Vinimon. Se você recebeu esta mensagem, o envio está funcionando.',
    },
    {},
  )
  const id = await prisma.$transaction((tx) =>
    enfileirarEmail(tx, {
      para: dados.para,
      assunto,
      texto,
      html,
      evento: 'teste',
      chaveIdempotencia: `teste:${randomUUID()}`,
    }),
  )
  await despacharEmail(id)
  return { id }
}

/**
 * Eventos que podem levar a lista de distribuição (T-19.5). Só texto sem conteúdo interno: `comentario` fica de fora
 * (pode ser interno, como na T-12.3); `lembrete` e `recuperar_senha` são pessoais (este último leva link de senha).
 */
export const EVENTOS_PARA_LISTA: readonly EventoEmail[] = [
  'abertura',
  'agendamento',
  'conclusao',
  'encaminhamento',
  'encerramento_automatico',
  'rejeicao',
  'solicitacao_retorno',
]

/** E-mails das listas vinculadas ao modelo do evento, sem repetir (sem distinção de caixa). Vazio se o evento não pode ir a listas ou o modelo está inativo. */
export async function emailsDasListasDoEvento(tx: Tx, evento: EventoEmail): Promise<string[]> {
  if (!EVENTOS_PARA_LISTA.includes(evento)) return []
  const modelo = await tx.modeloEmail.findUnique({
    where: { evento },
    select: { ativo: true, listaIds: true },
  })
  if (!modelo?.ativo || modelo.listaIds.length === 0) return []
  const listas = await tx.listaEmail.findMany({
    where: { id: { in: modelo.listaIds } },
    select: { emails: true },
    orderBy: { id: 'asc' },
  })
  const unicos = new Map<string, string>()
  for (const lista of listas) for (const email of lista.emails) unicos.set(email.toLowerCase(), email)
  return [...unicos.values()]
}

/**
 * Grava na outbox um e-mail por destinatário das listas do evento, na transação do chamador. Devolve os ids para
 * `despacharEmail` depois do commit. A chave de idempotência de cada um inclui o e-mail de destino.
 */
export async function enfileirarListasDoEvento(
  tx: Tx,
  evento: EventoEmail,
  base: { assunto: string; texto: string; html?: string; chamadoId?: number; chaveIdempotencia: string },
): Promise<number[]> {
  const ids: number[] = []
  for (const para of await emailsDasListasDoEvento(tx, evento)) {
    ids.push(
      await enfileirarEmail(tx, {
        ...base,
        para,
        evento,
        chaveIdempotencia: `${base.chaveIdempotencia}:lista:${para.toLowerCase()}`,
      }),
    )
  }
  return ids
}
