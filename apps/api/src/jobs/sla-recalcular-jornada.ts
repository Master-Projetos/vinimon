import { prisma } from '../lib/prisma'
import { invalidarCalendario, recalcularChamado } from '../modules/sla/service'

const LOTE = 200

/**
 * Recalcula os chamados em aberto (`concluido_em IS NULL`) de uma jornada, em lotes de 200 por cursor de id, cada
 * um na própria transação (um chamado com problema não trava os outros). `recalcularChamado` zera os avisos de SLA
 * quando os prazos mudam. Devolve quantos foram recalculados.
 */
export async function recalcularJornada(jornadaId: number, agora: Date): Promise<number> {
  invalidarCalendario(jornadaId) // o worker pode ter um calendário velho em memória
  let recalculados = 0
  let cursor = 0
  for (;;) {
    const lote = await prisma.chamado.findMany({
      where: { jornadaId, concluidoEm: null, id: { gt: cursor } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: LOTE,
    })
    if (lote.length === 0) return recalculados
    for (const c of lote) {
      await prisma.$transaction((tx) => recalcularChamado(tx, c.id, agora))
      recalculados += 1
    }
    cursor = lote.at(-1)?.id ?? cursor
  }
}
