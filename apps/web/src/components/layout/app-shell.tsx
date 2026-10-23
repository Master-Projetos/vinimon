import { useRouteContext } from '@tanstack/react-router'
import { type Perfil, temPermissao } from '@vinimon/shared'
import { Bell, BookOpenText, ChartColumn, LayoutDashboard, Monitor, Settings, Ticket } from 'lucide-react'
import type { ReactNode } from 'react'
import { useFocoAoNavegar } from '@/hooks/use-foco-ao-navegar'
import { AppBar } from './app-bar'
import type { AppBarItemDef, AppId } from './app-bar-item'
import { MobileNav } from './mobile-nav'
import { SkipLink } from './skip-link'
import { TopBar } from './top-bar'

export interface AppShellProps {
  children: ReactNode
  /** Contadores por app (ex.: notificações não lidas em Atividade). Ligados na T-10.15. */
  contadores?: Partial<Record<AppId, number>>
}

// Itens da §6.2. Os `to` apontam para rotas existentes; `permissao` esconde o item (a API garante o acesso).
const ITENS: AppBarItemDef[] = [
  { id: 'atividade', rotulo: 'Atividade', rotuloAcessivel: 'Atividade', icone: Bell, to: '/atividade', atalho: 'g a' },
  { id: 'chamados', rotulo: 'Chamados', rotuloAcessivel: 'Chamados', icone: Ticket, to: '/chamados', atalho: 'g c' },
  { id: 'painel', rotulo: 'Painel', rotuloAcessivel: 'Painel', icone: LayoutDashboard, to: '/painel', atalho: 'g p' },
  {
    id: 'conhecimento',
    rotulo: 'Base',
    rotuloAcessivel: 'Base de conhecimento',
    icone: BookOpenText,
    to: '/conhecimento',
    atalho: 'g b',
  },
  {
    id: 'inventario',
    rotulo: 'Inventário',
    rotuloAcessivel: 'Inventário',
    icone: Monitor,
    to: '/inventario',
    permissao: 'inventario.ver',
    atalho: 'g i',
  },
  {
    id: 'relatorios',
    rotulo: 'Relatórios',
    rotuloAcessivel: 'Relatórios',
    icone: ChartColumn,
    to: '/relatorios',
    permissao: 'relatorio.ver',
    atalho: 'g r',
  },
  {
    id: 'admin',
    rotulo: 'Admin',
    rotuloAcessivel: 'Administração',
    icone: Settings,
    to: '/admin',
    permissao: 'cadastro.gerenciar',
    atalho: 'g d',
  },
]

/** Itens visíveis para o perfil (sem perfil, só os que não exigem permissão). */
export function itensVisiveis(perfil: Perfil | null, contadores: Partial<Record<AppId, number>> = {}): AppBarItemDef[] {
  return ITENS.filter(
    (item) => item.permissao === undefined || (perfil !== null && temPermissao(perfil, item.permissao)),
  ).map((item) => ({ ...item, contador: contadores[item.id] }))
}

// Grid da §6.2: topbar em cima; no desktop, app bar à esquerda e área de trabalho com canto arredondado.
export function AppShell({ children, contadores }: AppShellProps) {
  const { sessao } = useRouteContext({ from: '/_app' })
  useFocoAoNavegar()

  const usuario = sessao.usuario
  const itens = itensVisiveis(usuario?.perfil ?? null, contadores)

  return (
    <div className="grid h-dvh grid-rows-[var(--topbar-h)_minmax(0,1fr)_auto] md:grid-cols-[var(--appbar-w)_minmax(0,1fr)] md:grid-rows-[var(--topbar-h)_minmax(0,1fr)]">
      <SkipLink />
      <TopBar usuario={usuario ? { id: usuario.id, nome: usuario.nome } : null} />
      {/* O diálogo de atalhos entra na tarefa de atalhos; até lá o botão Ajuda não faz nada. */}
      <AppBar itens={itens} aoAbrirAjuda={() => undefined} />
      <div className="flex min-h-0 min-w-0 overflow-hidden bg-background md:rounded-tl-xl md:border-t md:border-l">
        <main
          id="conteudo"
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto focus:outline-none"
        >
          {children}
        </main>
      </div>
      <MobileNav itens={itens} />
    </div>
  )
}
