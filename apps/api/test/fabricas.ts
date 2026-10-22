// apps/api/test/fabricas.ts
import { randomBytes } from 'node:crypto'
import type { PapelStatus } from '@vinimon/shared'
import { seedBase } from '../prisma/seed'
import { prisma, type Tx } from '../src/lib/prisma'

// Sufixo único por execução (cada arquivo de teste roda em outro contexto de módulo) + contador por processo.
const execucao = randomBytes(3).toString('hex')
let sequencia = 0
const proximo = (): string => {
  sequencia += 1
  return `${execucao}${sequencia}`
}

export type BaseSemeada = {
  statusPorPapel: Record<PapelStatus, number>
  prioridadePadraoId: number
  canalWebId: number
  canalTelefoneId: number
  jornada24x7Id: number
  jornadaComercialId: number
  unidadeId: number
}

/** Roda o seed base (com catálogos) e devolve os ids principais. Idempotente: chamar de novo devolve os mesmos ids. */
export async function semearBase(): Promise<BaseSemeada> {
  return prisma.$transaction(
    async (tx: Tx) => {
      await seedBase(tx, { catalogos: true })

      const statusComPapel = await tx.status.findMany({
        where: { papel: { not: null } },
        select: { id: true, papel: true },
      })
      const idDoPapel = (papel: PapelStatus): number => {
        const achado = statusComPapel.find((s) => s.papel === papel)
        if (!achado) throw new Error(`status sem papel ${papel} após o seed base`)
        return achado.id
      }
      // Campo explícito por papel: se um papel novo surgir, o tipo Record<PapelStatus, number> obriga a incluí-lo.
      const statusPorPapel: Record<PapelStatus, number> = {
        INICIAL: idDoPapel('INICIAL'),
        EM_ATENDIMENTO: idDoPapel('EM_ATENDIMENTO'),
        ENCAMINHADO: idDoPapel('ENCAMINHADO'),
        AGUARDANDO_SOLICITANTE: idDoPapel('AGUARDANDO_SOLICITANTE'),
        AGENDADO: idDoPapel('AGENDADO'),
        CONCLUIDO: idDoPapel('CONCLUIDO'),
        ENCERRADO: idDoPapel('ENCERRADO'),
        CANCELADO: idDoPapel('CANCELADO'),
      }

      const prioridade = await tx.prioridade.findFirstOrThrow({ where: { padrao: true }, select: { id: true } })
      const web = await tx.canal.findUniqueOrThrow({ where: { nome: 'Sistema Web' }, select: { id: true } })
      const telefone = await tx.canal.findUniqueOrThrow({ where: { nome: 'Telefone' }, select: { id: true } })
      const j24 = await tx.jornada.findUniqueOrThrow({ where: { nome: '24x7' }, select: { id: true } })
      const comercial = await tx.jornada.findUniqueOrThrow({ where: { nome: 'Comercial' }, select: { id: true } })
      const unidade = await tx.unidade.findUniqueOrThrow({ where: { nome: 'Principal' }, select: { id: true } })

      return {
        statusPorPapel,
        prioridadePadraoId: prioridade.id,
        canalWebId: web.id,
        canalTelefoneId: telefone.id,
        jornada24x7Id: j24.id,
        jornadaComercialId: comercial.id,
        unidadeId: unidade.id,
      }
    },
    { timeout: 60_000 },
  )
}

/** Cria um departamento. Sem `unidadeId`, usa a unidade "Principal" (criada se faltar). */
export async function criarDepartamento(dados: { unidadeId?: number; nome?: string } = {}) {
  const unidadeId =
    dados.unidadeId ??
    (
      await prisma.unidade.upsert({
        where: { nome: 'Principal' },
        update: {},
        create: { nome: 'Principal' },
        select: { id: true },
      })
    ).id
  return prisma.departamento.create({
    data: { unidadeId, nome: dados.nome ?? `Departamento ${proximo()}` },
    select: { id: true, nome: true },
  })
}

/** Cria um problema (tipo de chamado) vinculado às áreas informadas. `areaPadraoId` deve estar entre elas. */
export async function criarProblema(dados: {
  areaIds: number[]
  areaPadraoId?: number
  slaRespostaMin?: number
  slaSolucaoMin?: number
}) {
  return prisma.problema.create({
    data: {
      nome: `Problema ${proximo()}`,
      areaPadraoId: dados.areaPadraoId ?? null,
      slaRespostaMin: dados.slaRespostaMin ?? null,
      slaSolucaoMin: dados.slaSolucaoMin ?? null,
      areas: { create: dados.areaIds.map((areaId) => ({ areaId })) },
    },
    select: { id: true, nome: true },
  })
}

/** Cria um tipo de ativo com nome único. */
export async function criarTipoAtivo() {
  return prisma.tipoAtivo.create({
    data: { nome: `Tipo ${proximo()}` },
    select: { id: true, nome: true },
  })
}

/** Cria um ativo com etiqueta única (alfanumérica, sem espaços). Sem `tipoId`, cria um tipo de ativo. */
export async function criarAtivo(dados: { tipoId?: number; departamentoId?: number | null } = {}) {
  const tipoId = dados.tipoId ?? (await criarTipoAtivo()).id
  return prisma.ativo.create({
    data: { etiqueta: `ATV${proximo()}`, tipoId, departamentoId: dados.departamentoId ?? null },
    select: { id: true, etiqueta: true },
  })
}

/**
 * Insere um chamado direto pelo Prisma (sem passar pelas regras da API). O status vem do papel, com `statusTipo`
 * coerente e as colunas que os CHECKs do banco exigem para ele (solução, datas, agendamento, cancelamento).
 * Canal "Sistema Web", jornada 24x7 (ou `jornadaId`), prioridade padrão e `versao` 0.
 */
export async function criarChamado(dados: {
  solicitanteId: number
  areaId: number
  papel?: PapelStatus
  operadorId?: number | null
  problemaId?: number | null
  abertoEm?: Date
  jornadaId?: number
  slaRespostaMin?: number | null
  slaSolucaoMin?: number | null
}) {
  const base = await semearBase() // idempotente; sem cache, porque `limparBanco` reinicia os ids entre os testes
  const papel = dados.papel ?? 'INICIAL'
  const status = await prisma.status.findUniqueOrThrow({
    where: { id: base.statusPorPapel[papel] },
    select: { id: true, tipo: true, pausaSla: true },
  })
  const abertoEm = dados.abertoEm ?? new Date()
  const umDia = 24 * 60 * 60 * 1000
  const concluido = status.tipo === 'CONCLUIDO' || status.tipo === 'ENCERRADO'
  return prisma.chamado.create({
    data: {
      assunto: `Chamado de teste ${proximo()}`,
      descricao: 'Descrição do chamado de teste.',
      solicitanteId: dados.solicitanteId,
      abertoPorId: dados.solicitanteId,
      operadorId: dados.operadorId ?? null,
      areaId: dados.areaId,
      problemaId: dados.problemaId ?? null,
      prioridadeId: base.prioridadePadraoId,
      canalId: base.canalWebId,
      statusId: status.id,
      statusTipo: status.tipo,
      statusDesde: abertoEm,
      slaPausado: status.pausaSla,
      abertoEm,
      jornadaId: dados.jornadaId ?? base.jornada24x7Id,
      slaRespostaMin: dados.slaRespostaMin ?? null,
      slaSolucaoMin: dados.slaSolucaoMin ?? null,
      ...(status.tipo === 'AGENDADO' ? { agendadoPara: new Date(abertoEm.getTime() + umDia) } : {}),
      ...(concluido
        ? { concluidoEm: abertoEm, solucao: papel === 'CANCELADO' ? null : 'Solução do chamado de teste.' }
        : {}),
      ...(status.tipo === 'ENCERRADO' ? { encerradoEm: abertoEm, cancelado: papel === 'CANCELADO' } : {}),
    },
  })
}
