import type { LinkProps } from '@tanstack/react-router'
import { gravar, ler } from '@/lib/storage'

export interface AcaoRapida {
  id: string
  rotulo: string
  to: LinkProps['to']
}

/** Ações estáticas do cliente (§3.9). */
export const ACOES: readonly AcaoRapida[] = [{ id: 'novo-chamado', rotulo: 'Novo chamado', to: '/chamados/novo' }]

export interface Recente {
  chamadoId: number
  rotulo: string
}

const MAX_RECENTES = 8
const chaveRecentes = (usuarioId: number) => `u${usuarioId}:recentes`

export function lerRecentes(usuarioId: number): Recente[] {
  const bruto = ler<unknown>(chaveRecentes(usuarioId), [])
  if (!Array.isArray(bruto)) return []
  return bruto.flatMap((r): Recente[] =>
    typeof r === 'object' &&
    r !== null &&
    'chamadoId' in r &&
    'rotulo' in r &&
    typeof r.chamadoId === 'number' &&
    typeof r.rotulo === 'string'
      ? [{ chamadoId: r.chamadoId, rotulo: r.rotulo }]
      : [],
  )
}

/** Guarda o chamado aberto na busca, sem repetição e com os 8 mais recentes. */
export function registrarRecente(usuarioId: number, recente: Recente): void {
  const atuais = lerRecentes(usuarioId).filter((r) => r.chamadoId !== recente.chamadoId)
  gravar(chaveRecentes(usuarioId), [recente, ...atuais].slice(0, MAX_RECENTES))
}
