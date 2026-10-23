import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { DoisFatoresForm } from '@/features/auth/components/dois-fatores-form'
import { LoginForm } from '@/features/auth/components/login-form'

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
  const [etapa, setEtapa] = useState<'login' | 'dois-fatores'>('login')
  if (etapa === 'dois-fatores') {
    return <DoisFatoresForm redirect={redirect} onVoltar={() => setEtapa('login')} />
  }
  return <LoginForm redirect={redirect} onPendenteMfa={() => setEtapa('dois-fatores')} />
}
