import { useQuery } from '@tanstack/react-query'
import { RelatorioQuerySchema } from '@vinimon/shared'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { metaConsultas } from '@/features/meta/queries'
import type { RelatorioBusca } from '../queries'

export interface RelatorioFiltrosProps {
  valores: RelatorioBusca
  aoAplicar: (busca: RelatorioBusca) => void
}

/**
 * Filtros do relatório. Os valores vêm da URL; ao aplicar, a tela grava a nova busca na URL. Quem monta este
 * componente deve passar `key` com a busca atual, para o formulário recomeçar quando a URL mudar.
 */
export function RelatorioFiltros({ valores, aoAplicar }: RelatorioFiltrosProps) {
  const { data: meta } = useQuery(metaConsultas.tudo())
  const [de, setDe] = useState(valores.de ?? '')
  const [ate, setAte] = useState(valores.ate ?? '')
  const [areaId, setAreaId] = useState(valores.areaId === undefined ? 'todas' : String(valores.areaId))
  const [operadorId, setOperadorId] = useState(valores.operadorId === undefined ? '' : String(valores.operadorId))
  const [erro, setErro] = useState<string | null>(null)

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const operador = operadorId.trim()
    if (operador !== '' && !/^\d+$/.test(operador)) {
      setErro('Informe o número do operador (ID).')
      return
    }
    const candidato = {
      de: de === '' ? undefined : de,
      ate: ate === '' ? undefined : ate,
      areaId: areaId === 'todas' ? undefined : Number(areaId),
      operadorId: operador === '' ? undefined : Number(operador),
    }
    const resultado = RelatorioQuerySchema.safeParse(candidato)
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? 'Confira os filtros.')
      return
    }
    setErro(null)
    aoAplicar(resultado.data)
  }

  return (
    <form
      onSubmit={enviar}
      noValidate
      data-print="ocultar"
      aria-label="Filtros do relatório"
      className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="relatorio-de">De</Label>
        <Input id="relatorio-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="relatorio-ate">Até</Label>
        <Input id="relatorio-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="relatorio-area">Área</Label>
        <Select value={areaId} onValueChange={setAreaId}>
          <SelectTrigger id="relatorio-area" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as áreas</SelectItem>
            {(meta?.areas ?? []).map((area) => (
              <SelectItem key={area.id} value={String(area.id)}>
                {area.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="relatorio-operador">Operador (ID)</Label>
        <Input
          id="relatorio-operador"
          inputMode="numeric"
          autoComplete="off"
          value={operadorId}
          onChange={(e) => setOperadorId(e.target.value)}
        />
      </div>
      <div>
        <Button type="submit">Aplicar filtros</Button>
      </div>
      {erro ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-full">
          {erro}
        </p>
      ) : null}
    </form>
  )
}
