import type { FastifyBaseLogger } from 'fastify'
import { PgBoss } from 'pg-boss'
import { env } from '../env'
import { definirFila } from '../lib/filas'
import { purgarAuditoria } from './auditoria-purga'
import { autoAprovar } from './chamados-auto-aprovacao'
import { retornarAgendados } from './chamados-retorno-agendados'
import { limparSessoes } from './sessoes-limpeza'

export interface Job {
  fila: string
  /** Cron de 5 campos, no fuso America/Sao_Paulo. Sem cron, só roda sob demanda. */
  cron?: string
  /** Idempotente; recebe `agora` injetado para os testes. */
  executar(dados: Record<string, unknown>, agora: Date): Promise<void>
}

export const JOBS: Job[] = [
  {
    fila: 'chamados-retorno-agendados',
    cron: '* * * * *',
    executar: async (_dados, agora) => {
      await retornarAgendados(agora)
    },
  },
  {
    fila: 'chamados-auto-aprovacao',
    cron: '*/5 * * * *',
    executar: async (_dados, agora) => {
      await autoAprovar(agora)
    },
  },
  {
    fila: 'sessoes-limpeza',
    cron: '17 * * * *',
    executar: async (_dados, agora) => {
      await limparSessoes(agora)
    },
  },
  {
    fila: 'auditoria-purga',
    cron: '11 4 1 * *',
    executar: async () => {
      await purgarAuditoria()
    },
  },
]

let iniciados = false
export const jobsIniciados = (): boolean => iniciados

export async function iniciarJobs(log: FastifyBaseLogger): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' })
  boss.on('error', (err) => log.error({ err }, 'pg-boss'))
  await boss.start()
  for (const job of JOBS) {
    if (!(await boss.getQueue(job.fila))) await boss.createQueue(job.fila)
    await boss.work<Record<string, unknown>>(job.fila, async (lote) => {
      for (const item of lote) await job.executar(item.data ?? {}, new Date())
    })
    if (job.cron) await boss.schedule(job.fila, job.cron, null, { tz: 'America/Sao_Paulo' })
  }
  definirFila({
    async enviar(fila, dados, opcoes) {
      await boss.send(fila, dados, opcoes ?? {})
    },
  })
  iniciados = true
  return boss
}
