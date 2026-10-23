import { env } from '../../env'
import { jobsIniciados } from '../../jobs'
import { prisma } from '../../lib/prisma'

/** Falha (lança) se o banco não responde ou os jobs habilitados não subiram: usado em /saude/pronto. */
export async function verificarBanco(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`
  if (env.JOBS_HABILITADOS && !jobsIniciados()) throw new Error('jobs não iniciados')
}
