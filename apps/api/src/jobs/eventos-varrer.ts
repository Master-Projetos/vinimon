import { prisma } from '../lib/prisma'
import { processarEvento } from '../modules/notificacoes/fanout'

const LOTE = 200
const UM_MINUTO_MS = 60_000

/**
 * Varredura do outbox (§3.8): reprocessa eventos com `processado_em IS NULL` criados há mais de 1 minuto (até 200 por
 * execução, do mais antigo). O claim do `processarEvento` torna a repetição segura. Devolve quantos foram tentados.
 */
export async function varrerEventos(agora: Date): Promise<number> {
  const pendentes = await prisma.chamadoEvento.findMany({
    where: { processadoEm: null, criadoEm: { lt: new Date(agora.getTime() - UM_MINUTO_MS) } },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: LOTE,
  })
  let tentados = 0
  for (const e of pendentes) {
    try {
      await processarEvento(e.id)
      tentados += 1
    } catch {
      // continua nos demais; este volta na próxima varredura
    }
  }
  return tentados
}
