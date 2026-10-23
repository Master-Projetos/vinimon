import { Skeleton } from '@/components/ui/skeleton'

export interface PageSkeletonProps {
  variante?: 'lista' | 'tabela' | 'detalhe' | 'conversa' | 'formulario' | 'painel'
}

const CHAVES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

function Linhas({ quantidade }: { quantidade: number }) {
  return (
    <div className="flex flex-col gap-3">
      {CHAVES.slice(0, quantidade).map((chave) => (
        <Skeleton key={chave} className="h-10 w-full" />
      ))}
    </div>
  )
}

export function PageSkeleton({ variante = 'lista' }: PageSkeletonProps) {
  return (
    <div role="status" aria-label="Carregando" className="flex flex-col gap-4 p-4" data-variante={variante}>
      {variante === 'detalhe' ? <Skeleton className="h-8 w-1/2" /> : null}
      {variante === 'painel' ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CHAVES.slice(0, 4).map((chave) => (
            <Skeleton key={chave} className="h-24 w-full" />
          ))}
        </div>
      ) : null}
      {variante === 'conversa' ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="ml-auto h-12 w-1/2" />
          <Skeleton className="h-16 w-3/5" />
        </div>
      ) : null}
      {variante === 'formulario' ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}
      {variante === 'tabela' || variante === 'lista' ? <Linhas quantidade={variante === 'tabela' ? 8 : 5} /> : null}
      {variante === 'detalhe' || variante === 'painel' ? <Linhas quantidade={3} /> : null}
    </div>
  )
}
