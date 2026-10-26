import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { authApi, type SessaoResposta } from '@vinimon/shared'
import { useState } from 'react'
import { z } from 'zod'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { DoisFatoresForm } from '@/features/auth/components/dois-fatores-form'
import { LoginForm } from '@/features/auth/components/login-form'
import { destinoDaSessao } from '@/features/auth/queries'
import { chamar } from '@/lib/api'

// S79: só caminhos internos (T70)
const LoginBuscaSchema = z.object({
  redirect: z
    .string()
    .regex(/^\/(?!\/)[^\s\\]*$/)
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute('/login')({
  validateSearch: LoginBuscaSchema,
  component: LoginPagina,
})

function LoginPagina() {
  const { redirect } = Route.useSearch()
  const router = useRouter()
  const [etapa, setEtapa] = useState<'credenciais' | '2fa'>('credenciais')

  const seguir = (s: SessaoResposta) => {
    const destino = destinoDaSessao(s.estado, redirect)
    if (destino === null) return setEtapa('2fa')
    router.history.push(destino)
  }

  return etapa === 'credenciais' ? (
    <AuthLayout titulo="Entrar" descricao="Use o seu login e a sua senha.">
      <LoginForm aoEntrar={seguir} />
      <LinkRecuperacao />
    </AuthLayout>
  ) : (
    <AuthLayout titulo="Verificação em duas etapas" descricao="Confirme que é você para concluir a entrada.">
      <DoisFatoresForm aoVerificar={seguir} />
    </AuthLayout>
  )
}

/** Só aparece com `email.habilitado` (GET /auth/recuperacao). Falha ou sem resposta: sem link. */
function LinkRecuperacao() {
  const { data } = useQuery({
    queryKey: ['auth', 'recuperacao'],
    queryFn: ({ signal }) => chamar(authApi.recuperacaoHabilitada, {}, signal),
    retry: false,
    staleTime: 5 * 60_000,
  })
  if (data?.habilitada !== true) return null
  return (
    <p className="mt-4 text-center text-sm">
      <Link to="/recuperar-senha" className="text-primary underline-offset-4 hover:underline">
        Esqueci minha senha
      </Link>
    </p>
  )
}
