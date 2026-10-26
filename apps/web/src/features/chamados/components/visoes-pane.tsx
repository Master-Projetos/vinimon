import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Perfil } from '@vinimon/shared'
import { ErrorState } from '@/components/feedback/error-state'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { type ChamadoBusca, comVisao, visaoEfetiva, visoesDoPerfil } from '../filtros'
import { chamadosConsultas } from '../queries'

export interface VisoesPaneProps {
  perfil: Perfil
  busca: ChamadoBusca
}

/** Visões da §3.6 com contagem. Trocar de visão só muda `?visao=` na URL. */
export function VisoesPane({ perfil, busca }: VisoesPaneProps) {
  const contagens = useQuery(chamadosConsultas.contagens())
  const ativa = visaoEfetiva(busca.visao, perfil)
  const visoes = visoesDoPerfil(perfil)

  return (
    <nav aria-label="Visões de chamados" className="shrink-0 border-b p-2 md:w-60 md:border-r md:border-b-0 md:p-3">
      {contagens.isError ? (
        <ErrorState compacto erro={contagens.error} aoTentarNovamente={() => void contagens.refetch()} />
      ) : (
        <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {visoes.map((v) => {
            const total = contagens.data?.[v.id]
            const eAtiva = v.id === ativa
            return (
              <li key={v.id} className="shrink-0">
                <Link
                  to="/chamados"
                  search={(anterior) => comVisao(anterior, v.id)}
                  aria-current={eAtiva ? 'page' : undefined}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm whitespace-nowrap outline-none',
                    'hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    eAtiva && 'bg-accent font-medium',
                  )}
                >
                  <span>{v.rotulo}</span>
                  {contagens.isPending ? (
                    <Skeleton role="status" aria-label="Carregando contagem" className="h-5 w-6" />
                  ) : total === undefined ? null : (
                    <Badge variant="secondary" aria-label={`${total} chamados`}>
                      {total}
                    </Badge>
                  )}
                </Link>
              </li>
            )
          })}
          {contagens.data?.['areas-geridas'] === undefined ? null : (
            <li className="shrink-0">
              <Link
                to="/areas-geridas"
                className={cn(
                  'flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm whitespace-nowrap outline-none',
                  'hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                )}
              >
                <span>Áreas geridas</span>
                <Badge variant="secondary" aria-label={`${contagens.data['areas-geridas']} chamados`}>
                  {contagens.data['areas-geridas']}
                </Badge>
              </Link>
            </li>
          )}
        </ul>
      )}
    </nav>
  )
}
