import { createFileRoute, useRouter } from '@tanstack/react-router'
import type { SessaoResposta } from '@vinimon/shared'
import { useState } from 'react'
import { z } from 'zod'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { DoisFatoresForm } from '@/features/auth/components/dois-fatores-form'
import { LoginForm } from '@/features/auth/components/login-form'
import { destinoDaSessao } from '@/features/auth/queries'

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
    </AuthLayout>
  ) : (
    <AuthLayout titulo="Verificação em duas etapas" descricao="Confirme que é você para concluir a entrada.">
      <DoisFatoresForm aoVerificar={seguir} />
    </AuthLayout>
  )
}
