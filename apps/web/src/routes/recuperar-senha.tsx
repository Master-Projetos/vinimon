import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { authApi, EsqueciSenhaBodySchema } from '@vinimon/shared'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { CampoForm } from '@/components/form/campo-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { chamar } from '@/lib/api'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'

const FormularioSchema = z.object({
  login: z.string().trim().min(1, 'Informe o login.'),
})

export const Route = createFileRoute('/recuperar-senha')({
  component: RecuperarSenhaPagina,
})

/** Pedido de recuperação. A resposta é sempre a mensagem genérica da API: esta tela nunca revela se o login existe. */
function RecuperarSenhaPagina() {
  const form = useZodForm(FormularioSchema, { defaultValues: { login: '' } })
  const [mensagem, setMensagem] = useState<string | null>(null)
  const pedir = useMutation({
    mutationFn: (login: string) => chamar(authApi.esqueciSenha, { body: { login } }),
    meta: { silenciarErro: true }, // o formulário trata (aplicarErrosDoServidor)
  })

  const enviar = form.handleSubmit(async (dados) => {
    const body = EsqueciSenhaBodySchema.safeParse(dados)
    if (!body.success) {
      form.setError('login', { message: 'Login inválido.' })
      return
    }
    try {
      const resposta = await pedir.mutateAsync(body.data.login)
      setMensagem(resposta.mensagem)
    } catch (erro) {
      aplicarErrosDoServidor(form.setError, erro)
    }
  })

  return (
    <AuthLayout titulo="Esqueci minha senha" descricao="Informe o seu login para receber o link de redefinição.">
      {mensagem === null ? (
        <form onSubmit={enviar} noValidate className="space-y-4">
          <CampoForm control={form.control} name="login" rotulo="Login" obrigatorio>
            {(field, controle) => <Input {...field} {...controle} autoComplete="username" autoFocus />}
          </CampoForm>
          <Button type="submit" className="w-full" disabled={pedir.isPending}>
            {pedir.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Enviar link
          </Button>
        </form>
      ) : (
        <p role="status" className="text-sm">
          {mensagem}
        </p>
      )}
      <p className="mt-4 text-center text-sm">
        <Link to="/login" className="text-primary underline-offset-4 hover:underline">
          Voltar ao login
        </Link>
      </p>
    </AuthLayout>
  )
}
