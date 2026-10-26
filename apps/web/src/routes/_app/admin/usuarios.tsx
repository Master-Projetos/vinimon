import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { Usuario } from '@vinimon/shared'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { UserAvatar } from '@/components/display/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { metaConsultas } from '@/features/meta/queries'
import { AcoesUsuarioMenu } from '@/features/usuarios/components/acoes-usuario-menu'
import { SenhaTemporariaDialog } from '@/features/usuarios/components/senha-temporaria-dialog'
import { UsuarioSheet } from '@/features/usuarios/components/usuario-sheet'
import { usuariosConsultas } from '@/features/usuarios/queries'
import { formatarRelativo } from '@/lib/datas'
import { ROTULOS_PERFIL } from '@/lib/rotulos'

const BuscaSchema = z.object({
  pagina: z.int().min(1).optional(),
  busca: z.string().trim().max(100).optional(),
})

export const Route = createFileRoute('/_app/admin/usuarios')({
  validateSearch: BuscaSchema,
  loaderDeps: ({ search }) => ({ pagina: search.pagina ?? 1, busca: search.busca }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(usuariosConsultas.lista(deps)),
      context.queryClient.ensureQueryData(metaConsultas.tudo()),
    ])
  },
  component: UsuariosPagina,
})

function UsuariosPagina() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const pagina = search.pagina ?? 1
  const { data } = useSuspenseQuery(usuariosConsultas.lista({ pagina, busca: search.busca }))
  const [editando, setEditando] = useState<Usuario | 'novo' | null>(null)
  const [senha, setSenha] = useState<{ nome: string; valor: string } | null>(null)
  const totalPaginas = Math.max(1, Math.ceil(data.total / data.porPagina))
  const agora = new Date()

  return (
    <section className="space-y-4 p-(--pane-px)">
      <header className="flex h-14 items-center justify-between">
        <h1 className="text-title" tabIndex={-1}>
          Usuários
        </h1>
        <Button onClick={() => setEditando('novo')}>
          <Plus aria-hidden="true" /> Novo usuário
        </Button>
      </header>

      <form
        aria-label="Buscar usuários"
        className="flex gap-2"
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
          aria-label="Buscar usuários"
          placeholder="Nome, login ou e-mail"
          defaultValue={search.busca ?? ''}
          className="w-72"
        />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      <Table aria-label="Usuários">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Login</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Perfil</TableHead>
            <TableHead>Área</TableHead>
            <TableHead>2FA</TableHead>
            <TableHead>Último acesso</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-24">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.itens.map((u) => (
            <TableRow key={u.id} className="h-(--row-h)">
              <TableCell>
                <span className="flex items-center gap-2">
                  <UserAvatar usuario={{ id: u.id, nome: u.nome }} tamanho="sm" />
                  {u.nome}
                </span>
              </TableCell>
              <TableCell>{u.login}</TableCell>
              <TableCell>{u.email ?? '—'}</TableCell>
              <TableCell>{ROTULOS_PERFIL[u.perfil]}</TableCell>
              <TableCell>{u.area?.nome ?? '—'}</TableCell>
              <TableCell>{u.mfaAtivo ? 'Ativo' : '—'}</TableCell>
              <TableCell>{u.ultimoLoginEm ? formatarRelativo(u.ultimoLoginEm, agora) : 'Nunca'}</TableCell>
              <TableCell>
                <Badge variant={u.ativo ? 'secondary' : 'outline'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Editar ${u.nome}`} onClick={() => setEditando(u)}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <AcoesUsuarioMenu usuario={u} aoSenhaTemporaria={(valor) => setSenha({ nome: u.nome, valor })} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <nav aria-label="Paginação" className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>
          Página {pagina} de {totalPaginas}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={pagina <= 1}
          onClick={() => navigate({ search: (s) => ({ ...s, pagina: pagina - 1 }) })}
        >
          Anterior
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pagina >= totalPaginas}
          onClick={() => navigate({ search: (s) => ({ ...s, pagina: pagina + 1 }) })}
        >
          Próxima
        </Button>
      </nav>

      <UsuarioSheet
        usuario={editando}
        aoFechar={() => setEditando(null)}
        aoCriar={(nome, valor) => setSenha({ nome, valor })}
      />
      <SenhaTemporariaDialog senha={senha?.valor ?? null} nome={senha?.nome ?? ''} aoFechar={() => setSenha(null)} />
    </section>
  )
}
