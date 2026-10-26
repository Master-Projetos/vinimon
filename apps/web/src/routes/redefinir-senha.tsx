import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { authApi, SenhaSchema } from '@vinimon/shared'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { PasswordInput } from '@/components/form/password-input'
import { PasswordStrength } from '@/components/form/password-strength'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { chamar, ErroApi } from '@/lib/api'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

// O token vem só da URL (?token=) e segue apenas para a API; nunca vai ao localStorage nem aparece em log.
const BuscaSchema = z.object({
  token: z.string().min(1).max(128).optional().catch(undefined),
})

const FormularioSchema = z
  .object({
    novaSenha: SenhaSchema,
    confirmacao: z.string().min(1, 'Repita a nova senha.'),
  })
  .refine((d) => d.novaSenha === d.confirmacao, { path: ['confirmacao'], message: 'As senhas não conferem.' })

export const Route = createFileRoute('/redefinir-senha')({
  validateSearch: BuscaSchema,
  component: RedefinirSenhaPagina,
})

function RedefinirSenhaPagina() {
  const { token } = Route.useSearch()
  if (token === undefined) {
    return (
      <AuthLayout titulo="Redefinir senha">
        <Alert variant="destructive" role="alert">
          <AlertDescription>Link inválido ou expirado. Peça um novo link.</AlertDescription>
        </Alert>
        <p className="mt-4 text-center text-sm">
          <Link to="/recuperar-senha" className="text-primary underline-offset-4 hover:underline">
            Pedir novo link
          </Link>
        </p>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout titulo="Nova senha" descricao="Escolha uma senha nova para entrar.">
      <FormularioRedefinir token={token} />
    </AuthLayout>
  )
}

function FormularioRedefinir({ token }: { token: string }) {
  const router = useRouter()
  const form = useZodForm(FormularioSchema, { defaultValues: { novaSenha: '', confirmacao: '' } })
  const novaSenha = form.watch('novaSenha')
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const redefinir = useMutation({
    mutationFn: (senha: string) => chamar(authApi.redefinirSenha, { body: { token, novaSenha: senha } }),
    meta: { silenciarErro: true }, // o formulário trata
  })

  const enviar = form.handleSubmit(async (dados) => {
    setErroGeral(null)
    try {
      await redefinir.mutateAsync(dados.novaSenha)
      toast.success('Senha redefinida. Entre com a nova senha.')
      void router.navigate({ to: '/login', replace: true })
    } catch (erro) {
      // link inválido, expirado ou já usado: a API não tem campo para isso, então a mensagem vai no topo
      if (erro instanceof ErroApi && erro.detalhes.length === 0) setErroGeral(erro.message)
      else aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      {erroGeral ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erroGeral}</AlertDescription>
        </Alert>
      ) : null}
      <CampoForm control={form.control} name="novaSenha" rotulo="Nova senha" obrigatorio>
        {(field, controle) => <PasswordInput {...field} {...controle} autoComplete="new-password" autoFocus />}
      </CampoForm>
      <PasswordStrength senha={novaSenha} />
      <CampoForm control={form.control} name="confirmacao" rotulo="Repita a nova senha" obrigatorio>
        {(field, controle) => <PasswordInput {...field} {...controle} autoComplete="new-password" />}
      </CampoForm>
      <Button type="submit" className="w-full" disabled={redefinir.isPending}>
        {redefinir.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Redefinir senha
      </Button>
    </form>
  )
}
