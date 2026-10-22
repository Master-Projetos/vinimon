import { prisma } from '../../lib/prisma'

/** Falha (lança) se o banco não responde: usado em /saude/pronto. */
export async function verificarBanco(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`
}
