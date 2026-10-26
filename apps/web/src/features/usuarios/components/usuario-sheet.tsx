import { useSuspenseQuery } from '@tanstack/react-query'
import { type AtualizarUsuario, CriarUsuarioSchema, PERFIS, type Usuario } from '@vinimon/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { CampoForm } from '@/components/form/campo-form'
import { MultiComboboxField } from '@/components/form/multi-combobox-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { metaConsultas } from '@/features/meta/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'
import { ROTULOS_PERFIL } from '@/lib/rotulos'
import { useSalvarUsuario } from '../queries'

export interface UsuarioSheetProps {
  usuario: Usuario | 'novo' | null
  aoFechar: () => void
  /** Usuário recém-criado: a senha temporária segue para o diálogo que a mostra uma vez. */
  aoCriar: (nome: string, senhaTemporaria: string) => void
}

const SEM = 'nenhum'

/** Criar ou editar um usuário (perfil, área, áreas secundárias e departamento). */
export function UsuarioSheet({ usuario, aoFechar, aoCriar }: UsuarioSheetProps) {
  const existente = usuario !== null && usuario !== 'novo' ? usuario : null
  const { data: meta } = useSuspenseQuery(metaConsultas.tudo())
  const salvar = useSalvarUsuario(existente?.id ?? null)
  // `areasGeridasIds` só existe no PATCH; fica fora do formulário de criação. null = sem alteração.
  const [edicaoGeridas, setEdicaoGeridas] = useState<{ usuarioId: number | undefined; ids: number[] } | null>(null)
  const geridas = edicaoGeridas !== null && edicaoGeridas.usuarioId === existente?.id ? edicaoGeridas.ids : null
  const geridasAtuais = geridas ?? existente?.areasGeridasIds ?? []
  const form = useZodForm(CriarUsuarioSchema, {
    values: {
      login: existente?.login ?? '',
      nome: existente?.nome ?? '',
      email: existente?.email ?? undefined,
      telefone: existente?.telefone ?? undefined,
      perfil: existente?.perfil ?? 'USUARIO',
      areaId: existente?.areaId ?? undefined,
      areaSecundariaIds: existente?.areaSecundariaIds ?? [],
      departamentoId: existente?.departamentoId ?? undefined,
      ativo: existente?.ativo ?? true,
    },
  })

  const enviar = form.handleSubmit(async (dados) => {
    try {
      if (existente) {
        // No PATCH, campo apagado vai como null (senão o servidor manteria o valor antigo).
        const corpo: AtualizarUsuario = {
          ...dados,
          email: dados.email ?? null,
          telefone: dados.telefone ?? null,
          areaId: dados.areaId ?? null,
          departamentoId: dados.departamentoId ?? null,
          ...(geridas === null ? {} : { areasGeridasIds: geridas }),
        }
        await salvar.mutateAsync({ atualizar: corpo })
        toast.success('Usuário atualizado')
      } else {
        const r = await salvar.mutateAsync({ criar: dados })
        toast.success('Usuário criado')
        if (r.senhaTemporaria) aoCriar(r.usuario.nome, r.senhaTemporaria)
      }
      aoFechar()
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  const texto = (valor: string | undefined) => valor ?? ''
  const opcional = (v: string) => (v === '' ? undefined : v)

  return (
    <Sheet open={usuario !== null} onOpenChange={(aberto) => (aberto ? undefined : aoFechar())}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{existente ? 'Editar usuário' : 'Novo usuário'}</SheetTitle>
          <SheetDescription>
            {existente ? 'Altere os dados e o acesso.' : 'Uma senha temporária é gerada e mostrada uma vez.'}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={enviar} className="grid gap-4 px-4" noValidate>
          <CampoForm control={form.control} name="login" rotulo="Login" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
          </CampoForm>
          <CampoForm control={form.control} name="nome" rotulo="Nome" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="off" />}
          </CampoForm>
          <CampoForm control={form.control} name="email" rotulo="E-mail">
            {(field, controle) => (
              <Input
                {...field}
                {...controle}
                type="email"
                value={texto(field.value)}
                onChange={(e) => field.onChange(opcional(e.target.value))}
              />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="telefone" rotulo="Telefone">
            {(field, controle) => (
              <Input
                {...field}
                {...controle}
                type="tel"
                value={texto(field.value)}
                onChange={(e) => field.onChange(opcional(e.target.value))}
              />
            )}
          </CampoForm>
          <CampoForm control={form.control} name="perfil" rotulo="Perfil" obrigatorio>
            {(field, controle) => (
              <Select
                value={field.value}
                onValueChange={(v) => field.onChange(PERFIS.find((p) => p === v) ?? field.value)}
              >
                <SelectTrigger {...controle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFIS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {ROTULOS_PERFIL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm control={form.control} name="areaId" rotulo="Área principal">
            {(field, controle) => (
              <Select
                value={field.value === undefined ? SEM : String(field.value)}
                onValueChange={(v) => field.onChange(v === SEM ? undefined : Number(v))}
              >
                <SelectTrigger {...controle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem área</SelectItem>
                  {meta.areas.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CampoForm>
          <CampoForm control={form.control} name="areaSecundariaIds" rotulo="Áreas secundárias">
            {(field, controle) => (
              <MultiComboboxField
                id={controle.id}
                aria-invalid={controle['aria-invalid']}
                aria-describedby={controle['aria-describedby']}
                opcoes={meta.areas.map((a) => ({ valor: String(a.id), rotulo: a.nome }))}
                valores={field.value.map(String)}
                placeholder="Escolha as áreas"
                aoMudar={(v) => field.onChange(v.map(Number))}
              />
            )}
          </CampoForm>
          {existente ? (
            <div className="grid gap-2">
              <Label htmlFor="areas-geridas">Áreas geridas</Label>
              <MultiComboboxField
                id="areas-geridas"
                opcoes={meta.areas.map((a) => ({ valor: String(a.id), rotulo: a.nome }))}
                valores={geridasAtuais.map(String)}
                placeholder="Escolha as áreas"
                aoMudar={(v) => setEdicaoGeridas({ usuarioId: existente.id, ids: v.map(Number) })}
              />
            </div>
          ) : null}
          <CampoForm control={form.control} name="departamentoId" rotulo="Departamento">
            {(field, controle) => (
              <Select
                value={field.value === undefined ? SEM : String(field.value)}
                onValueChange={(v) => field.onChange(v === SEM ? undefined : Number(v))}
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
                checked={field.value}
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
