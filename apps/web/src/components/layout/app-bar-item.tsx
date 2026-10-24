import { Link, type LinkProps } from '@tanstack/react-router'
import type { Permissao } from '@vinimon/shared'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AppId = 'atividade' | 'chamados' | 'painel' | 'conhecimento' | 'inventario' | 'relatorios' | 'admin'

export interface AppBarItemDef {
  id: AppId
  rotulo: string
  rotuloAcessivel: string
  icone: LucideIcon
  to: LinkProps['to']
  permissao?: Permissao
  contador?: number
  atalho: string
}

export interface AppBarItemProps {
  item: AppBarItemDef
  ativo: boolean
}

/** Diz se a rota atual está dentro do destino do item (ex.: `/chamados/125` ativa `/chamados`). */
export function estaAtivo(pathname: string, to: LinkProps['to']): boolean {
  const destino = String(to)
  return pathname === destino || pathname.startsWith(`${destino}/`)
}

/** Classes de um item de navegação; a app bar vertical e a barra inferior usam as mesmas. */
export function classesDoItem(ativo: boolean): string {
  return cn(
    'relative flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-md text-frame-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
    ativo && 'font-semibold text-primary',
  )
}

export function IndicadorAtivo({ ativo }: { ativo: boolean }) {
  if (!ativo) return null
  return (
    <span
      aria-hidden="true"
      className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
    />
  )
}

export function Contador({ valor }: { valor: number | undefined }) {
  if (valor === undefined || valor <= 0) return null
  return (
    <span
      aria-hidden="true"
      className="absolute -top-1 -right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive-solid px-1 text-[10px] leading-none font-medium text-white"
    >
      {valor > 99 ? '99+' : valor}
    </span>
  )
}

export function AppBarItem({ item, ativo }: AppBarItemProps) {
  const Icone = item.icone
  const rotuloCompleto =
    item.contador && item.contador > 0 ? `${item.rotuloAcessivel} (${item.contador})` : item.rotuloAcessivel
  return (
    <Link to={item.to} aria-current={ativo ? 'page' : undefined} className={classesDoItem(ativo)}>
      <IndicadorAtivo ativo={ativo} />
      <span className="relative">
        <Icone aria-hidden="true" className="size-6" />
        <Contador valor={item.contador} />
      </span>
      <span aria-hidden="true" className="text-appbar">
        {item.rotulo}
      </span>
      <span className="sr-only">{rotuloCompleto}</span>
    </Link>
  )
}
