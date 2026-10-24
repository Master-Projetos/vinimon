import { Link } from '@tanstack/react-router'
import type { Painel } from '@vinimon/shared'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatarDataHora } from '@/lib/datas'

export function SlaProximosTable({ itens }: { itens: Painel['slaProximo'] }) {
  return (
    <section aria-labelledby="sla-proximos" className="rounded-lg border bg-card p-4">
      <h2 id="sla-proximos" className="mb-3 text-sm font-medium">
        SLA mais próximo do vencimento
      </h2>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum chamado com prazo próximo.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chamado</TableHead>
              <TableHead>Assunto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Prazo da solução</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link to="/chamados/$chamadoId" params={{ chamadoId: c.id }} className="underline">
                    #{c.id}
                  </Link>
                </TableCell>
                <TableCell>{c.assunto}</TableCell>
                <TableCell>{c.status}</TableCell>
                <TableCell>{c.area}</TableCell>
                <TableCell>{formatarDataHora(c.prazoSolucaoEm)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
