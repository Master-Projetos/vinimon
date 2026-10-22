import { prisma } from '../lib/prisma'

/**
 * Apaga registros de auditoria com mais de 365 dias (S88). O relógio é o do banco, nunca o do Node; o trigger
 * `tg_auditoria_delete` só libera o DELETE com a GUC ligada na transação.
 */
export async function purgarAuditoria(): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL vinimon.purga_auditoria = 'on'`
    return tx.$executeRaw`DELETE FROM auditoria WHERE criado_em < now() - interval '365 days'`
  })
}
