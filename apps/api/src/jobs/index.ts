import type { FastifyBaseLogger } from 'fastify'
import { PgBoss } from 'pg-boss'
import { env } from '../env'
import { definirFila } from '../lib/filas'
import { executarEnvioEmailNotificacao } from '../modules/notificacoes/email-notificacao'
import { removerAnexosOrfaos } from './anexos-orfaos'
import { purgarAuditoria } from './auditoria-purga'
import { autoAprovar } from './chamados-auto-aprovacao'
import { retornarAgendados } from './chamados-retorno-agendados'
import { enviarResumoDiario } from './email-resumo-diario'
import { varrerEmails } from './email-varrer'
import { varrerEventos } from './eventos-varrer'
import { limparNotificacoes } from './notificacoes-limpeza'
import { limparSessoes } from './sessoes-limpeza'
import { alertarSla } from './sla-alertas'
import { recalcularJornada } from './sla-recalcular-jornada'

export interface Job {
  fila: string
  /** Cron de 5 campos, no fuso America/Sao_Paulo. Sem cron, só roda sob demanda. */
  cron?: string
  /** Idempotente; recebe `agora` injetado para os testes. */
  executar(dados: Record<string, unknown>, agora: Date): Promise<void>
}

export const JOBS: Job[] = [
  {
    fila: 'notificacoes-limpeza',
    cron: '23 3 * * *',
    executar: async (_dados, agora) => {
      await limparNotificacoes(agora)
    },
  },
  {
    fila: 'anexos-orfaos',
    cron: '41 3 * * *',
    executar: async (_dados, agora) => {
      await removerAnexosOrfaos(agora)
    },
  },
  {
    fila: 'sla-alertas',
    cron: '*/5 * * * *',
    executar: async (_dados, agora) => {
      await alertarSla(agora)
    },
  },
  {
    // sob demanda `{jornadaId}`: enfileirado quando a jornada ou os feriados mudam
    fila: 'sla-recalcular-jornada',
    executar: async (dados, agora) => {
      const jornadaId = dados.jornadaId
      if (typeof jornadaId !== 'number' || !Number.isInteger(jornadaId)) return
      await recalcularJornada(jornadaId, agora)
    },
  },
  {
    // envio com a regra de notificação (não envia se a notificação de origem já foi lida)
    fila: 'email-enviar',
    executar: async (dados) => {
      await executarEnvioEmailNotificacao(dados)
    },
  },
  {
    fila: 'email-resumo-diario',
    cron: '0 8 * * *',
    executar: async (_dados, agora) => {
      await enviarResumoDiario(agora)
    },
  },
  {
    fila: 'email-varrer',
    cron: '*/5 * * * *',
    executar: async (_dados, agora) => {
      await varrerEmails(agora)
    },
  },
  {
    fila: 'eventos-varrer',
    cron: '* * * * *',
    executar: async (_dados, agora) => {
      await varrerEventos(agora)
    },
  },
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
