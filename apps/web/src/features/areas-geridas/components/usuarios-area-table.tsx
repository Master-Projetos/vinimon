import { useSuspenseQuery } from '@tanstack/react-query'
import { AtualizarUsuarioGeridoSchema, type UsuarioGerido } from '@vinimon/shared'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { UserAvatar } from '@/components/display/user-avatar'
import { CampoForm } from '@/components/form/campo-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { metaConsultas } from '@/features/meta/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'
import { areasGeridasConsultas, useAtualizarUsuarioGerido } from '../queries'

const SEM = 'nenhum'

export interface UsuariosAreaTableProps {
  areaId: number
}

/** Usuários da área gerida, com edição de telefone, departamento e situação. */
export function UsuariosAreaTable({ areaId }: UsuariosAreaTableProps) {
  const { data } = useSuspenseQuery(areasGeridasConsultas.usuarios(areaId))
  const { data: meta } = useSuspenseQuery(metaConsultas.tudo())
  const [editando, setEditando] = useState<UsuarioGerido | null>(null)
  const departamento = (id: number | null) => meta.departamentos.find((d) => d.id === id)?.nome ?? '—'

  return (
    <>
      <Table aria-label="Usuários da área">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Departamento</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="w-16">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((u) => (
            <TableRow key={u.id} className="h-(--row-h)">
              <TableCell>
                <span className="flex items-center gap-2">
                  <UserAvatar usuario={{ id: u.id, nome: u.nome }} tamanho="sm" />
                  {u.nome}
                </span>
              </TableCell>
              <TableCell>{u.telefone ?? '—'}</TableCell>
              <TableCell>{departamento(u.departamentoId)}</TableCell>
              <TableCell>
                <Badge variant={u.ativo ? 'secondary' : 'outline'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
              </TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" aria-label={`Editar ${u.nome}`} onClick={() => setEditando(u)}>
                  <Pencil aria-hidden="true" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <EditarUsuarioGeridoSheet areaId={areaId} usuario={editando} aoFechar={() => setEditando(null)} />
    </>
  )
}

interface SheetProps {
  areaId: number
  usuario: UsuarioGerido | null
  aoFechar: () => void
}

function EditarUsuarioGeridoSheet({ areaId, usuario, aoFechar }: SheetProps) {
  const { data: meta } = useSuspenseQuery(metaConsultas.tudo())
  const salvar = useAtualizarUsuarioGerido(areaId, usuario?.id ?? 0)
  const form = useZodForm(AtualizarUsuarioGeridoSchema, {
    values: {
      telefone: usuario?.telefone ?? '',
      departamentoId: usuario?.departamentoId ?? null,
      ativo: usuario?.ativo ?? true,
    },
  })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync({
        telefone: dados.telefone === undefined || dados.telefone === '' ? null : dados.telefone,
        departamentoId: dados.departamentoId ?? null,
        ativo: dados.ativo ?? true,
      })
      toast.success('Usuário atualizado')
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <Sheet open={usuario !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Editar usuário</SheetTitle>
          <SheetDescription>{usuario?.nome}</SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="telefone" rotulo="Telefone">
            {(field, controle) => (
              <Input {...field} {...controle} type="tel" value={field.value ?? ''} autoComplete="off" />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="departamentoId" rotulo="Departamento">
            {(field, controle) => (
              <Select
                value={field.value === null || field.value === undefined ? SEM : String(field.value)}
                onValueChange={(v) => field.onChange(v === SEM ? null : Number(v))}
              >
                <SelectTrigger {...controle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem departamento</SelectItem>
                  {meta.departamentos.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm control={form.control} name="ativo" rotulo="Ativo">
            {(field, controle) => (
              <Switch
                id={controle.id}
                aria-describedby={controle['aria-describedby']}
                checked={field.value ?? true}
                onCheckedChange={field.onChange}
              />
            )}
          </CampoForm>
          <SheetFooter className="px-0">
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting || salvar.isPending}>
              Salvar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
