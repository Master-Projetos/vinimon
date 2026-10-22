import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

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
  return <p>Entre para continuar.</p>
}
