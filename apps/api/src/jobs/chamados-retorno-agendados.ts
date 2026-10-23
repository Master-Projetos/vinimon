import { ErroApp } from '../lib/erros'
import { prisma, type Tx } from '../lib/prisma'
import type { LogErro } from '../modules/chamados/eventos'
import { aposCommitChamado, type EfeitosChamado, registrarEvento, registrarSistema } from '../modules/chamados/eventos'
import { aplicarTransicaoStatus } from '../modules/sla/service'

const LOTE = 200

async function statusDoPapel(tx: Tx, papel: 'INICIAL' | 'EM_ATENDIMENTO'): Promise<number> {
  const s = await tx.status.findFirst({ where: { papel, ativo: true }, select: { id: true } })
  if (!s) throw new Error(`Não há status configurado para o papel ${papel}.`)
  return s.id
}

/**
 * Retorno de agendados (C09): AGENDADO com `agendadoPara <= agora` volta para EM_ATENDIMENTO se há operador, senão
 * para INICIAL. Uma transação por chamado, com a `versao` lida; conflito é ignorado (o próximo ciclo reavalia).
 * Idempotente: depois da transição o chamado deixa de ser candidato. Devolve quantos voltaram.
 */
export async function retornarAgendados(agora: Date, log?: LogErro): Promise<number> {
  const candidatos = await prisma.chamado.findMany({
    where: { statusTipo: 'AGENDADO', agendadoPara: { lte: agora } },
    select: { id: true, versao: true, operadorId: true },
    orderBy: { agendadoPara: 'asc' },
    take: LOTE,
  })
  let feitos = 0
  for (const c of candidatos) {
    try {
      const efeitos = await prisma.$transaction(async (tx): Promise<EfeitosChamado> => {
        await aplicarTransicaoStatus(tx, {
          chamadoId: c.id,
          versao: c.versao,
          novoStatusId: await statusDoPapel(tx, c.operadorId === null ? 'INICIAL' : 'EM_ATENDIMENTO'),
          atorId: null,
          agora,
        })
        const dados = { operadorId: c.operadorId }
        const sistema = await registrarSistema(
          tx,
          c.id,
          'RETORNO_AGENDAMENTO',
          'Chamado retornou do agendamento',
          dados,
        )
        const evento = await registrarEvento(tx, {
          chamadoId: c.id,
          tipo: 'RETORNO_AGENDAMENTO',
          atorId: null,
          assentamentoId: sistema,
          dados,
        })
        return {
          eventoIds: [evento],
          assentamentoIds: [sistema],
          campos: ['status', 'agendamento', 'operador'],
          acessoMudou: false,
          fila: 'status',
        }
      })
      feitos += 1
      await aposCommitChamado({ chamadoId: c.id, ...efeitos, ...(log ? { log } : {}) })
    } catch (err) {
      if (err instanceof ErroApp && err.status === 409) continue // alterado por outra pessoa: segue
      throw err
    }
  }
  return feitos
}
