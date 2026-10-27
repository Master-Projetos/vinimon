import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { type Ativo, SITUACOES_ATIVO, temPermissao } from '@vinimon/shared'
import { Package, Plus } from 'lucide-react'
import { useState } from 'react'
import { Pode } from '@/components/display/pode'
import { EmptyState } from '@/components/feedback/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExcluirCadastroDialog } from '@/features/admin/components/excluir-cadastro-dialog'
import { AtivoSheet } from '@/features/inventario/components/ativo-sheet'
import { AtivosTable } from '@/features/inventario/components/ativos-table'
import { ativosConsultas, useExcluirAtivo } from '@/features/inventario/queries'
import { metaConsultas } from '@/features/meta/queries'
import { ROTULOS_SITUACAO_ATIVO } from '@/lib/rotulos'

const TODOS = 'todos'

export const Route = createFileRoute('/_app/inventario/')({
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(ativosConsultas.lista(deps.search)),
      context.queryClient.ensureQueryData(metaConsultas.tudo()),
    ])
  },
  component: InventarioPagina,
})

function InventarioPagina() {
  const { sessao } = useRouteContext({ from: '/_app' })
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(ativosConsultas.lista(search))
  const { data: meta } = useSuspenseQuery(metaConsultas.tudo())
  const [editando, setEditando] = useState<Ativo | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<Ativo | null>(null)
  const excluir = useExcluirAtivo()
  const perfil = sessao.usuario?.perfil
  const podeGerenciar = perfil !== undefined && temPermissao(perfil, 'inventario.gerenciar')
  const podeExcluir = perfil !== undefined && temPermissao(perfil, 'cadastro.gerenciar')
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))
  const filtrado = search.busca !== undefined || search.situacao !== undefined || search.departamentoId !== undefined

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Inventário
        </h1>
        {perfil ? (
          <Pode perfil={perfil} permissao="inventario.gerenciar">
            <Button onClick={() => setEditando('novo')}>
              <Plus aria-hidden="true" /> Novo ativo
            </Button>
          </Pode>
        ) : null}
      </header>

      <form
        aria-label="Filtros do inventário"
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const campo = e.currentTarget.elements.namedItem('busca')
          const texto = campo instanceof HTMLInputElement ? campo.value.trim() : ''
          void navigate({ search: (s) => ({ ...s, busca: texto === '' ? undefined : texto, pagina: undefined }) })
        }}
      >
        <Input
          name="busca"
          type="search"
          aria-label="Buscar ativos"
          placeholder="Etiqueta, modelo ou série"
          defaultValue={search.busca ?? ''}
          className="w-64"
        />
        <Select
          value={search.situacao ?? TODOS}
          onValueChange={(v) =>
            void navigate({
              search: (s) => ({
                ...s,
                situacao: v === TODOS ? undefined : (v as (typeof SITUACOES_ATIVO)[number]),
                pagina: undefined,
              }),
            })
          }
        >
          <SelectTrigger aria-label="Situação" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as situações</SelectItem>
            {SITUACOES_ATIVO.map((s) => (
              <SelectItem key={s} value={s}>
                {ROTULOS_SITUACAO_ATIVO[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.departamentoId === undefined ? TODOS : String(search.departamentoId)}
          onValueChange={(v) =>
            void navigate({
              search: (s) => ({ ...s, departamentoId: v === TODOS ? undefined : Number(v), pagina: undefined }),
            })
          }
        >
          <SelectTrigger aria-label="Departamento" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os departamentos</SelectItem>
            {meta.departamentos.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      {data.itens.length === 0 ? (
        <EmptyState
          icone={Package}
          titulo={filtrado ? 'Nenhum ativo encontrado' : 'Nenhum ativo cadastrado'}
          descricao={filtrado ? 'Ajuste os filtros para ver outros resultados.' : undefined}
        />
      ) : (
        <AtivosTable
          ativos={data.itens}
          aoEditar={podeGerenciar ? (a) => setEditando(a) : undefined}
          aoExcluir={podeExcluir ? (a) => setExcluindo(a) : undefined}
        />
      )}

      <nav aria-label="Paginação" className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>
          Página {pagina} de {totalPaginas}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={pagina <= 1}
          onClick={() => void navigate({ search: (s) => ({ ...s, pagina: pagina - 1 }) })}
        >
          Anterior
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pagina >= totalPaginas}
          onClick={() => void navigate({ search: (s) => ({ ...s, pagina: pagina + 1 }) })}
        >
          Próxima
        </Button>
      </nav>

      <AtivoSheet ativo={editando} aoFechar={() => setEditando(null)} />
      <ExcluirCadastroDialog
        alvo={excluindo ? { id: excluindo.id, nome: excluindo.etiqueta } : null}
        tipo="o ativo"
        sucesso="Ativo excluído"
        aviso="Ativos que já têm chamados não podem ser excluídos: use a situação Baixado."
        excluir={(id) => excluir.mutateAsync(id)}
        aoFechar={() => setExcluindo(null)}
      />
    </section>
  )
}
