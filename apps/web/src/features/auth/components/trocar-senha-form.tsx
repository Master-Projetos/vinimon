import type { SessaoResposta } from '@vinimon/shared'
import { Loader2 } from 'lucide-react'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { PasswordInput } from '@/components/form/password-input'
import { PasswordStrength } from '@/components/form/password-strength'
import { Button } from '@/components/ui/button'
import { useTrocarSenha } from '@/features/auth/queries'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const FormularioSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.').max(128),
    novaSenha: z.string().min(1, 'Informe a nova senha.').max(128),
    confirmacao: z.string().min(1, 'Repita a nova senha.'),
  })
  .refine((d) => d.novaSenha === d.confirmacao, { path: ['confirmacao'], message: 'As senhas não conferem.' })

/** Troca obrigatória de senha (primeiro acesso ou senha redefinida). A regra de força é a do servidor (400 por campo). */
export function TrocarSenhaForm({
  login,
  aoTrocar,
}: {
  login?: string | undefined
  aoTrocar: (sessao: SessaoResposta) => void
}) {
  const trocar = useTrocarSenha()
  const form = useZodForm(FormularioSchema, { defaultValues: { senhaAtual: '', novaSenha: '', confirmacao: '' } })
  const novaSenha = form.watch('novaSenha')

  const enviar = form.handleSubmit(async ({ senhaAtual, novaSenha: nova }) => {
    try {
      aoTrocar(await trocar.mutateAsync({ senhaAtual, novaSenha: nova }))
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <CampoForm control={form.control} name="senhaAtual" rotulo="Senha atual" obrigatorio>
        {(field, controle) => <PasswordInput {...field} {...controle} autoComplete="current-password" autoFocus />}
      </CampoForm>
      <CampoForm control={form.control} name="novaSenha" rotulo="Nova senha" obrigatorio>
        {(field, controle) => <PasswordInput {...field} {...controle} autoComplete="new-password" />}
      </CampoForm>
      <PasswordStrength senha={novaSenha} entradas={login ? [login] : []} />
      <CampoForm control={form.control} name="confirmacao" rotulo="Repita a nova senha" obrigatorio>
        {(field, controle) => <PasswordInput {...field} {...controle} autoComplete="new-password" />}
      </CampoForm>
      <Button type="submit" className="w-full" disabled={trocar.isPending}>
        {trocar.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Trocar senha
      </Button>
    </form>
  )
}
