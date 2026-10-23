import nodemailer from 'nodemailer'
import { env } from '../env'
import { enfileirar } from './filas'
import { prisma, type Tx } from './prisma'

// Outbox de e-mails de saída (NOT-7). O registro é gravado na mesma transação do evento; o envio acontece no job
// `email-enviar`, depois do commit. Repetir o envio é seguro: só envia quem ainda está PENDENTE.

export interface EmailNovo {
  para: string
  assunto: string
  texto: string
  html?: string
  evento: string
  chamadoId?: number
  usuarioId?: number
  /** Chave de deduplicação: a mesma chave nunca gera dois registros nem dois envios. */
  chaveIdempotencia: string
}

/** Subconjunto do transporte do nodemailer que o módulo usa; os testes injetam um com `definirTransporte`. */
export interface Transporte {
  sendMail(mensagem: {
    from: string
    to: string
    subject: string
    text: string
    html?: string
    headers: Record<string, string>
  }): Promise<unknown>
}

let transporteInjetado: Transporte | undefined

/** Troca o transporte usado no envio (testes). Passe `undefined` para voltar ao padrão. */
export function definirTransporte(impl: Transporte | undefined): void {
  transporteInjetado = impl
}

function transporte(): Transporte {
  if (transporteInjetado) return transporteInjetado
  if (env.NODE_ENV === 'test') return nodemailer.createTransport({ jsonTransport: true })
  if (env.SMTP_URL === undefined) throw new Error('SMTP_URL não configurada')
  return nodemailer.createTransport(env.SMTP_URL)
}

/**
 * Grava o e-mail na outbox, dentro da transação do chamador, e devolve o id. Se a chave já existir, devolve o id
 * existente sem criar outro registro. Depois do commit, chame `despacharEmail(id)`.
 */
export async function enfileirarEmail(tx: Tx, dados: EmailNovo): Promise<number> {
  await tx.emailSaida.createMany({
    data: [
      {
        para: dados.para,
        assunto: dados.assunto,
        texto: dados.texto,
        html: dados.html,
        evento: dados.evento,
        chamadoId: dados.chamadoId,
        usuarioId: dados.usuarioId,
        chaveIdempotencia: dados.chaveIdempotencia,
      },
    ],
    skipDuplicates: true,
  })
  const registro = await tx.emailSaida.findUniqueOrThrow({
    where: { chaveIdempotencia: dados.chaveIdempotencia },
    select: { id: true },
  })
  return registro.id
}

/** Agenda o envio do job `email-enviar`. Chame depois do commit da transação que gravou a outbox. */
export function despacharEmail(id: number): Promise<void> {
  return enfileirar('email-enviar', { id }, { retryLimit: 5, retryBackoff: true })
}

/**
 * Envia um e-mail da outbox. Só envia se o registro está PENDENTE, e reivindica o envio com um UPDATE condicional
 * (`tentativas` como comparação). Em falha, o registro volta a PENDENTE com o erro e a exceção segue para o job.
 */
export async function enviarEmail(id: number): Promise<void> {
  const atual = await prisma.emailSaida.findUnique({
    where: { id },
    select: { status: true, tentativas: true, para: true, assunto: true, texto: true, html: true },
  })
  if (atual?.status !== 'PENDENTE') return

  const reivindicado = await prisma.emailSaida.updateMany({
    where: { id, status: 'PENDENTE', tentativas: atual.tentativas },
    data: { tentativas: { increment: 1 } },
  })
  if (reivindicado.count === 0) return

  try {
    await transporte().sendMail({
      from: env.MAIL_FROM ?? 'Vinimon <nao-responda@localhost>',
      to: atual.para,
      subject: atual.assunto,
      text: atual.texto,
      ...(atual.html === null ? {} : { html: atual.html }),
      headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
    })
  } catch (err) {
    const erro = err instanceof Error ? err.message.slice(0, 1000) : 'falha desconhecida'
    await prisma.emailSaida.updateMany({ where: { id, status: 'PENDENTE' }, data: { erro } })
    throw err
  }

  await prisma.emailSaida.updateMany({
    where: { id, status: 'PENDENTE' },
    data: { status: 'ENVIADO', enviadoEm: new Date(), erro: null },
  })
}
