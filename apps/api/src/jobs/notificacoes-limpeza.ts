import { obterConfig } from '../lib/config'
import { prisma } from '../lib/prisma'

const UM_DIA_MS = 24 * 60 * 60 * 1000

/**
 * Apaga as notificações lidas há mais de `notificacoes.retencaoDias` dias (S123). As não lidas nunca são apagadas.
 * Devolve quantas foram removidas.
 */
export async function limparNotificacoes(agora: Date): Promise<number> {
  const dias = (await obterConfig())['notificacoes.retencaoDias']
  const limite = new Date(agora.getTime() - dias * UM_DIA_MS)
  const { count } = await prisma.notificacao.deleteMany({ where: { lidaEm: { lt: limite } } })
  return count
}
