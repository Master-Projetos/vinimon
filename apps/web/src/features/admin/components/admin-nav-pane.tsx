import { Link, useLocation } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

interface ItemAdmin {
  to:
    | '/admin/usuarios'
    | '/admin/prioridades'
    | '/admin/status'
    | '/admin/problemas'
    | '/admin/canais'
    | '/admin/tags'
    | '/admin/jornadas'
    | '/admin/feriados'
    | '/admin/unidades'
    | '/admin/departamentos'
    | '/admin/areas'
    | '/admin/tipos-ativo'
    | '/admin/categorias-artigo'
    | '/admin/configuracoes'
    | '/admin/auditoria'
  rotulo: string
}

const SECOES: { titulo: string; itens: ItemAdmin[] }[] = [
  { titulo: 'Pessoas', itens: [{ to: '/admin/usuarios', rotulo: 'Usuários' }] },
  {
    titulo: 'Chamados',
    itens: [
      { to: '/admin/prioridades', rotulo: 'Prioridades' },
      { to: '/admin/status', rotulo: 'Status' },
      { to: '/admin/problemas', rotulo: 'Problemas' },
      { to: '/admin/canais', rotulo: 'Canais' },
      { to: '/admin/tags', rotulo: 'Tags' },
    ],
  },
  {
    titulo: 'SLA',
    itens: [
      { to: '/admin/jornadas', rotulo: 'Jornadas' },
      { to: '/admin/feriados', rotulo: 'Feriados' },
    ],
  },
  {
    titulo: 'Estrutura',
    itens: [
      { to: '/admin/unidades', rotulo: 'Unidades' },
      { to: '/admin/departamentos', rotulo: 'Departamentos' },
      { to: '/admin/areas', rotulo: 'Áreas' },
      { to: '/admin/tipos-ativo', rotulo: 'Tipos de ativo' },
      { to: '/admin/categorias-artigo', rotulo: 'Categorias de artigo' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { to: '/admin/configuracoes', rotulo: 'Configurações' },
      { to: '/admin/auditoria', rotulo: 'Auditoria' },
    ],
  },
]

/** Painel de navegação da administração. No celular vira uma faixa horizontal rolável. */
export function AdminNavPane() {
  const caminho = useLocation({ select: (l) => l.pathname.replace(/\/$/, '') })

  return (
    <nav
      aria-label="Administração"
      className="shrink-0 border-b p-2 md:w-60 md:overflow-y-auto md:border-r md:border-b-0 md:p-3"
    >
      <div className="flex gap-4 overflow-x-auto md:flex-col md:gap-3 md:overflow-visible">
        {SECOES.map((secao) => (
          <section key={secao.titulo} aria-label={secao.titulo} className="shrink-0">
            <h2 className="px-3 py-1 text-label text-muted-foreground uppercase">{secao.titulo}</h2>
            <ul className="flex gap-1 md:flex-col">
              {secao.itens.map((item) => {
                const ativo = caminho === item.to
                return (
                  <li key={item.to} className="shrink-0">
                    <Link
                      to={item.to}
                      aria-current={ativo ? 'page' : undefined}
                      className={cn(
                        'flex rounded-md px-3 py-2 text-sm whitespace-nowrap outline-none',
                        'hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        ativo && 'bg-accent font-medium',
                      )}
                    >
                      {item.rotulo}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  )
}
