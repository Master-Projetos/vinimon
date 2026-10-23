import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type Perfil, SLAS_FILTRO, temPermissao } from '@vinimon/shared'
import { Download, Inbox, Plus, SearchX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DataTable } from '@/components/data/data-table'
import { DataTableFacetedFilter, type FacetOpcao } from '@/components/data/data-table-faceted-filter'
import { DataTableToolbar } from '@/components/data/data-table-toolbar'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { metaConsultas } from '@/features/meta/queries'
import { useAgora } from '@/hooks/use-agora'
import { useDebounce } from '@/hooks/use-debounce'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ROTULOS_SITUACAO_SLA } from '@/lib/rotulos'
import { colunasChamados, type OrdenacaoChamados } from '../columns'
import { type ChamadoBusca, limparFiltros, visaoEfetiva } from '../filtros'
import { chamadosConsultas } from '../queries'
import { ChamadoListItem } from './chamado-list-item'

const TODOS = 'todos'
const POR_PAGINA = [25, 50, 100] as const
type PorPagina = (typeof POR_PAGINA)[number]

/** Chaves da URL que são filtros (a paginação e a ordem não contam para "tem filtro"). */
const CHAVES_FILTRO = [
  'busca',
  'statusIds',
  'prioridadeIds',
  'areaIds',
  'problemaIds',
  'operadorIds',
  'canalIds',
  'tagIds',
  'departamentoIds',
  'solicitanteId',
  'sla',
  'avaliacao',
  'teveRejeicao',
  'de',
  'ate',
  'concluidoDe',
  'concluidoAte',
] as const

/** Query do CSV: os mesmos filtros da tela, sem paginação (cada valor de lista vira um parâmetro repetido). */
export function queryDoCsv(busca: ChamadoBusca): string {
  const q = new URLSearchParams()
  for (const [chave, valor] of Object.entries(busca)) {
    if (valor === undefined || valor === null || valor === '' || chave === 'pagina' || chave === 'porPagina') continue
    if (Array.isArray(valor)) for (const v of valor) q.append(chave, String(v))
    else q.set(chave, String(valor))
  }
  return q.toString()
}

export interface ChamadosTableProps {
  busca: ChamadoBusca
  perfil: Perfil
}

export function ChamadosTable({ busca, perfil }: ChamadosTableProps) {
  const navigate = useNavigate({ from: '/chamados' })
  const agora = useAgora(60_000)
  const largo = useMediaQuery('(min-width: 768px)')
  const filtros = useMemo(() => ({ ...busca, visao: visaoEfetiva(busca.visao, perfil) }), [busca, perfil])
  const lista = useQuery(chamadosConsultas.lista(filtros))
  const meta = useQuery(metaConsultas.tudo())

  const [termo, setTermo] = useState(busca.busca ?? '')
  const termoAtrasado = useDebounce(termo, 300)

  /** Troca parte da URL e volta para a página 1 (a menos que o parcial traga `pagina`). */
  const mudar = useCallback(
    (parcial: Partial<ChamadoBusca>) => {
      void navigate({ search: (s) => ({ ...s, pagina: undefined, ...parcial }) })
    },
    [navigate],
  )

  // Só envia para a URL quando o texto (já atrasado) muda de verdade; assim voltar/avançar no histórico não é desfeito.
  const enviado = useRef(busca.busca ?? '')
  useEffect(() => {
    const texto = termoAtrasado.trim()
    if (texto === enviado.current) return
    enviado.current = texto
    mudar({ busca: texto === '' ? undefined : texto })
  }, [termoAtrasado, mudar])

  const campoOrdem = busca.ordem ?? 'id'
  const direcaoOrdem = busca.direcao ?? 'desc'
  const ordenacao: OrdenacaoChamados = { campo: campoOrdem, direcao: direcaoOrdem }
  const colunas = useMemo(
    () =>
      colunasChamados({
        ordenacao: { campo: campoOrdem, direcao: direcaoOrdem },
        aoOrdenar: (o) => mudar({ ordem: o.campo as ChamadoBusca['ordem'], direcao: o.direcao }),
        agora,
      }),
    [campoOrdem, direcaoOrdem, mudar, agora],
  )

  const limpar = () => {
    setTermo('')
    enviado.current = ''
    void navigate({ search: (s) => limparFiltros(s) })
  }

  const temFiltro = CHAVES_FILTRO.some((k) => busca[k] !== undefined)
  const podeCsv = temPermissao(perfil, 'relatorio.ver')
  const podeAbrir = temPermissao(perfil, 'chamado.abrir')

  if (lista.isError) return <ErrorState erro={lista.error} aoTentarNovamente={() => void lista.refetch()} />

  const opcoes = (itens: { id: number; nome: string; cor?: string }[] | undefined): FacetOpcao[] =>
    (itens ?? []).map((i) => ({ valor: String(i.id), rotulo: i.nome, ...(i.cor ? { cor: i.cor } : {}) }))
  const faceta = (
    titulo: string,
    lista: { id: number; nome: string; cor?: string }[] | undefined,
    chave: keyof ChamadoBusca,
  ) => (
    <DataTableFacetedFilter
      titulo={titulo}
      opcoes={opcoes(lista)}
      selecionados={((busca[chave] as number[] | undefined) ?? []).map(String)}
      aoMudar={(v) => mudar({ [chave]: v.length === 0 ? undefined : v.map(Number) } as Partial<ChamadoBusca>)}
    />
  )

  const itens = lista.data?.itens ?? []
  const total = lista.data?.total ?? 0
  const pagina = busca.pagina ?? 1
  const porPagina: PorPagina = POR_PAGINA.find((n) => n === (busca.porPagina ?? 25)) ?? 25

  const vazio = temFiltro ? (
    <EmptyState
      icone={SearchX}
      titulo="Nenhum chamado encontrado"
      descricao="Nenhum chamado combina com esses filtros."
      acao={
        <Button type="button" variant="outline" onClick={limpar}>
          Limpar filtros
        </Button>
      }
    />
  ) : (
    <EmptyState
      icone={Inbox}
      titulo="Tudo em dia"
      descricao="Não há chamados nesta visão."
      acao={
        podeAbrir ? (
          <Button asChild>
            <a href="/chamados/novo">
              <Plus aria-hidden="true" /> Abrir chamado
            </a>
          </Button>
        ) : undefined
      }
    />
  )

  const barra = (
    <DataTableToolbar busca={termo} aoMudarBusca={setTermo} rotuloBusca="Buscar chamados">
      {faceta('Status', meta.data?.status, 'statusIds')}
      {faceta('Prioridade', meta.data?.prioridades, 'prioridadeIds')}
      {faceta('Área', meta.data?.areas, 'areaIds')}
      {faceta('Problema', meta.data?.problemas, 'problemaIds')}
      {faceta('Canal', meta.data?.canais, 'canalIds')}
      {faceta('Departamento', meta.data?.departamentos, 'departamentoIds')}
      <div className="flex items-center gap-1">
        <Label htmlFor="filtro-de" className="text-xs text-muted-foreground">
          De
        </Label>
        <Input
          id="filtro-de"
          type="date"
          className="w-36"
          value={busca.de ?? ''}
          onChange={(e) => mudar({ de: e.target.value || undefined })}
        />
        <Label htmlFor="filtro-ate" className="text-xs text-muted-foreground">
          Até
        </Label>
        <Input
          id="filtro-ate"
          type="date"
          className="w-36"
          value={busca.ate ?? ''}
          onChange={(e) => mudar({ ate: e.target.value || undefined })}
        />
      </div>
      <Select value={busca.sla ?? TODOS} onValueChange={(v) => mudar({ sla: SLAS_FILTRO.find((s) => s === v) })}>
        <SelectTrigger aria-label="SLA" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todo SLA</SelectItem>
          {SLAS_FILTRO.map((s) => (
            <SelectItem key={s} value={s}>
              {ROTULOS_SITUACAO_SLA[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {temFiltro ? (
        <Button type="button" variant="ghost" size="sm" onClick={limpar}>
          Limpar filtros
        </Button>
      ) : null}
    </DataTableToolbar>
  )

  const csv = podeCsv ? (
    <Button asChild variant="outline" size="sm">
      <a
        href={`/api/v1/chamados/exportar?${queryDoCsv(filtros)}`}
        download={`chamados-${new Date().toISOString().slice(0, 10)}.csv`}
      >
        <Download aria-hidden="true" /> Exportar CSV
      </a>
    </Button>
  ) : null

  if (!largo) {
    return (
      <div className="flex flex-col gap-3 p-(--pane-px)">
        {barra}
        {lista.isPending ? <p role="status">Carregando chamados…</p> : null}
        {!lista.isPending && itens.length === 0 ? vazio : null}
        <ul aria-label="Chamados" className="flex flex-col gap-2">
          {itens.map((c) => (
            <ChamadoListItem key={c.id} chamado={c} agora={agora} />
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{total} chamados</span>
          <span className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pagina <= 1}
              onClick={() => mudar({ pagina: pagina - 1 })}
            >
              Anterior
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pagina * porPagina >= total}
              onClick={() => mudar({ pagina: pagina + 1 })}
            >
              Próxima
            </Button>
          </span>
        </div>
        {csv}
      </div>
    )
  }

  return (
    <div className="p-(--pane-px)">
      <DataTable
        rotulo="Chamados"
        colunas={colunas}
        dados={itens}
        obterIdLinha={(c) => String(c.id)}
        total={total}
        pagina={pagina}
        porPagina={porPagina}
        aoMudarPagina={(p) => mudar({ pagina: p })}
        aoMudarPorPagina={(n) => mudar({ porPagina: n })}
        ordenacao={ordenacao}
        aoOrdenar={(o) => mudar({ ordem: o.campo as ChamadoBusca['ordem'], direcao: o.direcao })}
        aoClicarLinha={(c) => void navigate({ to: '/chamados/$chamadoId', params: { chamadoId: c.id }, search: {} })}
        carregando={lista.isPending}
        atualizando={lista.isFetching && !lista.isPending}
        vazio={vazio}
        barraFerramentas={barra}
        rodape={csv}
        chavePersistencia="chamados:colunas:v1"
      />
    </div>
  )
}
