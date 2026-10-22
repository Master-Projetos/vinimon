import type { CSSProperties, ReactNode } from 'react'
import { obterCores } from '@/lib/cores'

export interface ColorBadgeProps {
  /** Cor em hex (#rrggbb), vinda do cadastro (status, prioridade). */
  cor: string
  children: ReactNode
}

/** Badge com cor configurável; o contraste AA vem de `obterCores`, nos dois temas. */
export function ColorBadge({ cor, children }: ColorBadgeProps) {
  const cores = obterCores(cor)
  const variaveis = {
    '--b-bg': cores.claro.fundo,
    '--b-fg': cores.claro.texto,
    '--b-borda': cores.claro.borda,
    '--b-ponto': cores.claro.ponto,
    '--b-bg-d': cores.escuro.fundo,
    '--b-fg-d': cores.escuro.texto,
    '--b-borda-d': cores.escuro.borda,
    '--b-ponto-d': cores.escuro.ponto,
  } as CSSProperties
  return (
    <span
      className="badge-cor inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
      style={variaveis}
    >
      <span aria-hidden="true" className="badge-cor-ponto size-1.5 rounded-full" />
      {children}
    </span>
  )
}
