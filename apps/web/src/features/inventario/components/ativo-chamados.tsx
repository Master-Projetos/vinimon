import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Inbox } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ativoDetalheConsultas } from '@/features/inventario/queries'
import { metaConsultas } from '@/features/meta/queries'
import { formatarDataHora } from '@/lib/datas'

export function AtivoChamados({ ativoId }: { ativoId: number }) {
  const [pagina, setPagina] = useState(1)
  const consulta = useQuery(ativoDetalheConsultas.chamados(ativoId, pagina))
  const { data: meta } = useQuery(metaConsultas.tudo())

  if (consulta.isError) return <ErrorState erro={consulta.error} aoTentarNovamente={() => void consulta.refetch()} />
  const dados = consulta.data
  if (!dados) return <p className="text-sm text-muted-foreground">Carregando…</p>
  if (dados.itens.length === 0) return <EmptyState icone={Inbox} titulo="Nenhum chamado vinculado a este ativo" />
  const totalPaginas = Math.max(1, Math.ceil(dados.total / dados.porPagina))

  return (
    <div className="space-y-3">
      <Table aria-label="Chamados do ativo">
        <TableHeader>
          <TableRow>
            <TableHead>Chamado</TableHead>
            <TableHead>Assunto</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Aberto em</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dados.itens.map((c) => (
            <TableRow key={c.id} className="h-(--row-h)">
              <TableCell className="font-medium">
                <Link
                  to="/chamados/$chamadoId"
                  params={{ chamadoId: c.id }}
                  className="underline-offset-2 hover:underline"
                >
                  #{c.id}
                </Link>
              </TableCell>
              <TableCell>{c.assunto}</TableCell>
              <TableCell>{meta?.status.find((s) => s.id === c.statusId)?.nome ?? '—'}</TableCell>
              <TableCell>{formatarDataHora(c.abertoEm)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <nav
        aria-label="Paginação dos chamados"
        className="flex items-center justify-end gap-2 text-xs text-muted-foreground"
      >
        <span>
          Página {pagina} de {totalPaginas}
        </span>
        <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
          Anterior
        </Button>
        <Button size="sm" variant="outline" disabled={pagina >= totalPaginas} onClick={() => setPagina(pagina + 1)}>
          Próxima
        </Button>
      </nav>
    </div>
  )
}
