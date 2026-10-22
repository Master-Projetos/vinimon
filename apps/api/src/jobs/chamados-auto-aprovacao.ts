import { obterConfig } from '../lib/config'
import { ErroApp } from '../lib/erros'
import { prisma, type Tx } from '../lib/prisma'
import {
  aposCommitChamado,
  type EfeitosChamado,
  type LogErro,
  registrarEvento,
  registrarSistema,
} from '../modules/chamados/eventos'
import { aplicarTransicaoStatus } from '../modules/sla/service'

const LOTE = 200

async function statusEncerrado(tx: Tx): Promise<number> {
  const s = await tx.status.findFirst({ where: { papel: 'ENCERRADO', ativo: true }, select: { id: true } })
  if (!s) throw new Error('Não há status configurado para o papel ENCERRADO.')
  return s.id
}

/**
 * Auto-aprovação (C15): CONCLUIDO com `validacaoLimiteEm <= agora` vai para ENCERRADO, com avaliação automática de
 * `chamado.avaliacaoAutomatica`. Uma transação por chamado, com a `versao` lida; conflito é ignorado. Idempotente.
 * Devolve quantos foram aprovados.
 */
export async function autoAprovar(agora: Date, log?: LogErro): Promise<number> {
  const nota = (await obterConfig())['chamado.avaliacaoAutomatica']
  const candidatos = await prisma.chamado.findMany({
    where: { statusTipo: 'CONCLUIDO', cancelado: false, validacaoLimiteEm: { lte: agora } },
    select: { id: true, versao: true },
    orderBy: { validacaoLimiteEm: 'asc' },
    take: LOTE,
  })
  let feitos = 0
  for (const c of candidatos) {
    try {
      const efeitos = await prisma.$transaction(async (tx): Promise<EfeitosChamado> => {
        await aplicarTransicaoStatus(tx, {
          chamadoId: c.id,
          versao: c.versao,
          novoStatusId: await statusEncerrado(tx),
          atorId: null,
          agora,
          extras: { validacaoLimiteEm: null },
        })
        await tx.avaliacaoChamado.create({
          data: { chamadoId: c.id, avaliadorId: null, nota, comentario: null, automatica: true },
        })
        const dados = { nota }
        const sistema = await registrarSistema(
          tx,
          c.id,
          'AUTO_APROVADO',
          'Atendimento validado automaticamente por decurso de prazo',
          dados,
        )
        const evento = await registrarEvento(tx, {
          chamadoId: c.id,
          tipo: 'AUTO_APROVADO',
          atorId: null,
          assentamentoId: sistema,
          dados,
        })
        return {
          eventoIds: [evento],
          assentamentoIds: [sistema],
          campos: ['status', 'avaliacao'],
          acessoMudou: false,
          fila: 'status',
        }
      })
      feitos += 1
      await aposCommitChamado({ chamadoId: c.id, ...efeitos, ...(log ? { log } : {}) })
    } catch (err) {
      if (err instanceof ErroApp && err.status === 409) continue
      throw err
    }
  }
  return feitos
}
