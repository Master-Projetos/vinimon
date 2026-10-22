import type { Prisma } from '../generated/prisma/client'
import type { Contexto } from './contexto'
import type { Tx } from './prisma'

export interface RegistroAuditoria {
  acao: string
  entidade: string
  entidadeId?: string | number | null
  /** Só diff/metadados; NUNCA senha, token, segredo ou código. */
  dados?: Record<string, unknown>
}

/** Converte Date e afins para JSON puro. */
export const paraJson = (valor: Record<string, unknown>): Prisma.InputJsonObject =>
  JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonObject

export async function auditar(tx: Tx, ctx: Contexto, r: RegistroAuditoria): Promise<void> {
  await tx.auditoria.create({
    data: {
      atorTipo: ctx.usuario ? 'USUARIO' : 'SISTEMA',
      atorId: ctx.usuario?.id ?? null,
      acao: r.acao,
      entidade: r.entidade,
      entidadeId: r.entidadeId === undefined || r.entidadeId === null ? null : String(r.entidadeId),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      dados: r.dados === undefined ? undefined : paraJson(r.dados),
    },
  })
}
