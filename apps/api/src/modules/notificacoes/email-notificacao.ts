import { type TipoNotificacao, textoNotificacao } from '@vinimon/shared'
import { executarEnvioEmail } from '../../jobs/email-enviar'
import { enfileirar } from '../../lib/filas'
import { prisma } from '../../lib/prisma'

/** Rótulos de sistema da notificação (S102): nunca texto de usuário. */
export interface RotulosEmail {
  areaNome?: string
  statusNome?: string
  marco?: string
}

/** Chave de idempotência do e-mail de uma notificação: muda a cada atualização, então cada evento sai uma vez. */
export const chaveEmailNotificacao = (notificacaoId: number, atualizadoEm: Date): string =>
  `notif:${notificacaoId}:${atualizadoEm.toISOString()}`

/** Id da notificação de origem, lido da chave `notif:<id>:<atualizadoEm>`; `null` para os demais e-mails. */
function notificacaoDaChave(chave: string): number | null {
  const id = /^notif:(\d+):/.exec(chave)?.[1]
  return id === undefined ? null : Number(id)
}

/**
 * Texto do e-mail, só com rótulos de sistema (S102). O comentário interno diz só que há um comentário, sem o texto.
 */
export function textoEmailNotificacao(
  tipo: TipoNotificacao,
  interno: boolean,
  chamadoId: number,
  rotulos: RotulosEmail,
): string {
  if (interno && tipo === 'COMENTARIO') return `Há um novo comentário interno no chamado #${chamadoId}`
  return textoNotificacao({ tipo, chamado: { id: chamadoId, assunto: '' }, atores: [], contagem: 1, dados: rotulos })
}

/** Agenda o envio de um e-mail de notificação 60 s depois do commit: dá tempo de a pessoa ver no app antes. */
export function despacharEmailNotificacao(emailId: number): Promise<void> {
  return enfileirar('email-enviar', { id: emailId }, { retryLimit: 5, retryBackoff: true, startAfter: 60 })
}

/**
 * Job `email-enviar` com a regra de notificação: se a notificação de origem já foi lida, o e-mail não sai. Marca
 * ENVIADO com erro "lida", sem enviar. Os demais e-mails seguem para o envio normal.
 */
export async function executarEnvioEmailNotificacao(dados: Record<string, unknown>): Promise<void> {
  const id = dados.id
  if (typeof id !== 'number' || !Number.isInteger(id)) return
  const email = await prisma.emailSaida.findUnique({ where: { id }, select: { status: true, chaveIdempotencia: true } })
  const notificacaoId = email === null ? null : notificacaoDaChave(email.chaveIdempotencia)
  if (email?.status === 'PENDENTE' && notificacaoId !== null) {
    const notificacao = await prisma.notificacao.findUnique({ where: { id: notificacaoId }, select: { lidaEm: true } })
    if (notificacao?.lidaEm) {
      await prisma.emailSaida.updateMany({
        where: { id, status: 'PENDENTE' },
        data: { status: 'ENVIADO', erro: 'lida' },
      })
      return
    }
  }
  await executarEnvioEmail(dados)
}
