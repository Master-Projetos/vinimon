import { despacharEmail } from '../lib/email'
import { prisma } from '../lib/prisma'

const LOTE = 200
const UM_MINUTO_MS = 60_000
const CINCO_MINUTOS_MS = 5 * UM_MINUTO_MS
const VINTE_E_QUATRO_HORAS_MS = 24 * 60 * UM_MINUTO_MS

/**
 * Varredura da outbox de e-mails (NOT-7), a cada 5 minutos: pendentes com mais de 24 h viram FALHOU; pendentes com
 * mais de 5 min são reenfileirados para `email-enviar` (até 200 por execução, do mais antigo). Devolve os contadores.
 */
export async function varrerEmails(agora: Date): Promise<{ falhou: number; reenfileirados: number }> {
  const falhou = await prisma.emailSaida.updateMany({
    where: { status: 'PENDENTE', criadoEm: { lt: new Date(agora.getTime() - VINTE_E_QUATRO_HORAS_MS) } },
    data: { status: 'FALHOU', erro: 'prazo de envio esgotado (24 h)' },
  })
  const pendentes = await prisma.emailSaida.findMany({
    where: { status: 'PENDENTE', criadoEm: { lt: new Date(agora.getTime() - CINCO_MINUTOS_MS) } },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: LOTE,
  })
  for (const p of pendentes) await despacharEmail(p.id)
  return { falhou: falhou.count, reenfileirados: pendentes.length }
}
