import type { Ativo, SituacaoAtivo } from '@vinimon/shared'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ROTULOS_SITUACAO_ATIVO } from '@/lib/rotulos'
import { cn } from '@/lib/utils'

// Cores das situações (§6.3, item 10).
const CLASSES_SITUACAO: Record<SituacaoAtivo, string> = {
  EM_USO: 'bg-success-soft text-success-soft-foreground',
  EM_ESTOQUE: 'bg-info-soft text-info-soft-foreground',
  EM_MANUTENCAO: 'bg-warning-soft text-warning-soft-foreground',
  BAIXADO: 'bg-muted text-muted-foreground',
}

export function SituacaoAtivoBadge({ situacao }: { situacao: SituacaoAtivo }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        CLASSES_SITUACAO[situacao],
      )}
    >
      {ROTULOS_SITUACAO_ATIVO[situacao]}
    </span>
  )
}

export interface AtivosTableProps {
  ativos: Ativo[]
  aoEditar?: (ativo: Ativo) => void
}

export function AtivosTable({ ativos, aoEditar }: AtivosTableProps) {
  return (
    <Table aria-label="Ativos">
      <TableHeader>
        <TableRow>
          <TableHead>Etiqueta</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Modelo</TableHead>
          <TableHead>Série</TableHead>
          <TableHead>Departamento</TableHead>
          <TableHead>Responsável</TableHead>
          <TableHead>Situação</TableHead>
          <TableHead className="text-right">Chamados</TableHead>
          {aoEditar ? (
            <TableHead className="w-12">
              <span className="sr-only">Ações</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {ativos.map((a) => (
          <TableRow key={a.id} className="h-(--row-h)">
            <TableCell className="font-medium">{a.etiqueta}</TableCell>
            <TableCell>{a.tipo}</TableCell>
            <TableCell>{a.modelo ?? '—'}</TableCell>
            <TableCell>{a.serie ?? '—'}</TableCell>
            <TableCell>{a.departamento ?? '—'}</TableCell>
            <TableCell>{a.responsavelTexto ?? '—'}</TableCell>
            <TableCell>
              <SituacaoAtivoBadge situacao={a.situacao} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{a.qtdChamados}</TableCell>
            {aoEditar ? (
              <TableCell>
                <Button size="icon" variant="ghost" aria-label={`Editar ${a.etiqueta}`} onClick={() => aoEditar(a)}>
                  <Pencil aria-hidden="true" />
                </Button>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
