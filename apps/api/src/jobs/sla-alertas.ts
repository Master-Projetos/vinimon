import type { TipoEvento } from '@vinimon/shared'
import type { Prisma } from '../generated/prisma/client'
import { prisma } from '../lib/prisma'
import { registrarEvento } from '../modules/chamados/eventos'
import { processarEvento } from '../modules/notificacoes/fanout'

const LOTE = 500

interface Alerta {
  evento: Extract<TipoEvento, 'SLA_RISCO' | 'SLA_ESTOURADO' | 'SLA_RESPOSTA_ESTOURADO'>
  /** Candidatos: ainda sem aviso deste tipo, chamado em curso e o marco já passou. */
  onde(agora: Date): Prisma.ChamadoWhereInput
  /** Marca o aviso (condicionado a ainda estar nulo: duas execuções nunca duplicam). */
  marcar(agora: Date): Prisma.ChamadoUncheckedUpdateManyInput
  /** Condição do `updateMany` que decide quem "ganhou" o aviso. */
  aindaSemAviso: Prisma.ChamadoWhereInput
}

const emCurso: Prisma.ChamadoWhereInput = { concluidoEm: null, cancelado: false }

const ALERTAS: Alerta[] = [
  {
    evento: 'SLA_RISCO',
    onde: (agora) => ({
      ...emCurso,
      slaAvisoRiscoEm: null,
      alertaSolucaoEm: { lte: agora },
      // já estourado vira SLA_ESTOURADO, não "em risco"
      prazoSolucaoEm: { gte: agora },
    }),
    marcar: (agora) => ({ slaAvisoRiscoEm: agora }),
    aindaSemAviso: { slaAvisoRiscoEm: null },
  },
  {
    evento: 'SLA_ESTOURADO',
    onde: (agora) => ({ ...emCurso, slaAvisoEstouroEm: null, prazoSolucaoEm: { lt: agora } }),
    marcar: (agora) => ({ slaAvisoEstouroEm: agora }),
    aindaSemAviso: { slaAvisoEstouroEm: null },
  },
  {
    evento: 'SLA_RESPOSTA_ESTOURADO',
    onde: (agora) => ({
      ...emCurso,
      slaAvisoRespostaEm: null,
      primeiraRespostaEm: null,
      prazoRespostaEm: { lt: agora },
    }),
    marcar: (agora) => ({ slaAvisoRespostaEm: agora }),
    aindaSemAviso: { slaAvisoRespostaEm: null },
  },
]

/**
 * Alertas de SLA (§3.10): três consultas (risco, estouro, resposta), em lotes de 500. Para cada chamado, o
 * `updateMany` condicionado a "aviso ainda nulo" decide quem registra o evento: se `count = 1` grava o evento (na
 * mesma transação) e, depois do commit, faz o fanout. Idempotente: a segunda execução não acha candidatos nem
 * duplica eventos. Um fanout que falha deixa o evento sem `processado_em` e a varredura o reprocessa.
 * Devolve quantos eventos foram criados.
 */
export async function alertarSla(agora: Date): Promise<number> {
  let criados = 0
  for (const alerta of ALERTAS) {
    const candidatos = await prisma.chamado.findMany({
      where: alerta.onde(agora),
      select: { id: true, prazoSolucaoEm: true, prazoRespostaEm: true },
      orderBy: { id: 'asc' },
      take: LOTE,
    })
    for (const c of candidatos) {
      const eventoId = await prisma.$transaction(async (tx) => {
        const { count } = await tx.chamado.updateMany({
          where: { AND: [{ id: c.id }, alerta.aindaSemAviso] },
          data: alerta.marcar(agora),
        })
        if (count !== 1) return null
        return registrarEvento(tx, {
          chamadoId: c.id,
          tipo: alerta.evento,
          atorId: null,
          dados: {
            prazoEm:
              (alerta.evento === 'SLA_RESPOSTA_ESTOURADO' ? c.prazoRespostaEm : c.prazoSolucaoEm)?.toISOString() ??
              null,
          },
        })
      })
      if (eventoId === null) continue
      criados += 1
      try {
        await processarEvento(eventoId)
      } catch {
        // fica sem `processado_em`: o `eventos-varrer` tenta de novo
      }
    }
  }
  return criados
}
