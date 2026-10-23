import { obterConfig } from '../lib/config'
import { ErroApp } from '../lib/erros'
import { prisma, type Tx } from '../lib/prisma'
import { despacharEmailSemFalhar, enfileirarEmailDoModelo } from '../modules/chamados/acoes'
import {
  aposCommitChamado,
  type EfeitosChamado,
  type LogErro,
  registrarEvento,
  registrarSistema,
} from '../modules/chamados/eventos'
import { adicionarDiasUteis } from '../modules/sla/calendario'
import { aplicarTransicaoStatus, carregarCalendario } from '../modules/sla/service'

const LOTE = 200
const UM_DIA_MS = 24 * 60 * 60 * 1000
const SOLUCAO_AUTOMATICA = 'Chamado encerrado automaticamente por falta de resposta do solicitante.'

async function statusEncerrado(tx: Tx): Promise<number> {
  const s = await tx.status.findFirst({ where: { papel: 'ENCERRADO', ativo: true }, select: { id: true } })
  if (!s) throw new Error('Não há status configurado para o papel ENCERRADO.')
  return s.id
}

/**
 * Auto-encerramento por inatividade (C19). Candidato: status em `inatividade.statusIds` (lista vazia desliga),
 * solicitante diferente do responsável e último comentário público que NÃO é do solicitante. Encerra quando
 * `statusDesde + inatividade.dias` (corridos, ou úteis na jornada do chamado com `inatividade.diasUteis`) < `agora`.
 * Efeito: papel ENCERRADO, avaliação automática (`inatividade.avaliacao`), evento AUTO_ENCERRADO e e-mail
 * `encerramento_automatico`. Uma transação por chamado, que reconfere versão, status e prazo; conflito é ignorado.
 * Idempotente: depois de encerrado o chamado deixa de ser candidato. Devolve quantos foram encerrados.
 */
export async function autoEncerrarPorInatividade(agora: Date, log?: LogErro): Promise<number> {
  const cfg = await obterConfig()
  const ids = cfg['inatividade.statusIds']
  if (ids.length === 0) return 0
  const dias = cfg['inatividade.dias']
  const diasUteis = cfg['inatividade.diasUteis']
  const nota = cfg['inatividade.avaliacao']
  // corte barato no banco: dias úteis nunca vencem antes dos corridos; a conferência exata é feita por chamado
  const corte = new Date(agora.getTime() - dias * UM_DIA_MS)

  let feitos = 0
  let ultimoId = 0
  for (;;) {
    const candidatos = await prisma.chamado.findMany({
      where: {
        id: { gt: ultimoId },
        statusId: { in: ids },
        statusTipo: { not: 'ENCERRADO' },
        cancelado: false,
        statusDesde: { lt: corte },
      },
      select: { id: true, versao: true, solicitanteId: true, operadorId: true, ultimaInteracaoAutorId: true },
      orderBy: { id: 'asc' },
      take: LOTE,
    })
    for (const c of candidatos) {
      // solicitante ≠ responsável e último comentário público que não é do solicitante
      if (c.operadorId === c.solicitanteId || c.ultimaInteracaoAutorId === c.solicitanteId) continue
      try {
        const resultado = await prisma.$transaction(async (tx) => {
          const atual = await tx.chamado.findUnique({
            where: { id: c.id },
            select: {
              versao: true,
              statusId: true,
              statusDesde: true,
              jornadaId: true,
              cancelado: true,
              solucao: true,
            },
          })
          if (!atual || atual.versao !== c.versao || atual.cancelado || !ids.includes(atual.statusId)) return null
          const limite = diasUteis
            ? adicionarDiasUteis(atual.statusDesde, dias, await carregarCalendario(tx, atual.jornadaId))
            : new Date(atual.statusDesde.getTime() + dias * UM_DIA_MS)
          if (limite.getTime() >= agora.getTime()) return null

          await aplicarTransicaoStatus(tx, {
            chamadoId: c.id,
            versao: c.versao,
            novoStatusId: await statusEncerrado(tx),
            atorId: null,
            agora,
            // o banco exige solução em chamado encerrado (ck_chamados_solucao): sem solução registrada, vai o motivo
            extras: { validacaoLimiteEm: null, ...(atual.solucao === null ? { solucao: SOLUCAO_AUTOMATICA } : {}) },
          })
          await tx.avaliacaoChamado.create({
            data: { chamadoId: c.id, avaliadorId: null, nota, comentario: null, automatica: true },
          })
          const dados = { nota, dias, diasUteis }
          const sistema = await registrarSistema(
            tx,
            c.id,
            'AUTO_ENCERRADO',
            'Chamado encerrado automaticamente por falta de resposta do solicitante',
            dados,
          )
          const evento = await registrarEvento(tx, {
            chamadoId: c.id,
            tipo: 'AUTO_ENCERRADO',
            atorId: null,
            assentamentoId: sistema,
            dados,
          })
          const emailId = await enfileirarEmailDoModelo(tx, {
            evento: 'encerramento_automatico',
            chamadoId: c.id,
            chaveIdempotencia: `encerramento_automatico:${c.id}`,
          })
          const efeitos: EfeitosChamado = {
            eventoIds: [evento],
            assentamentoIds: [sistema],
            campos: ['status', 'avaliacao'],
            acessoMudou: false,
            fila: 'status',
          }
          return { efeitos, emailId }
        })
        if (resultado === null) continue
        feitos += 1
        await despacharEmailSemFalhar(resultado.emailId)
        await aposCommitChamado({ chamadoId: c.id, ...resultado.efeitos, ...(log ? { log } : {}) })
      } catch (err) {
        if (err instanceof ErroApp && err.status === 409) continue // alterado por outra pessoa: o próximo ciclo reavalia
        throw err
      }
    }
    const ultimo = candidatos.at(-1)
    if (!ultimo || candidatos.length < LOTE) break
    ultimoId = ultimo.id
  }
  return feitos
}
