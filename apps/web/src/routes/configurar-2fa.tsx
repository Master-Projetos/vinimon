import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import type { SessaoResposta } from '@vinimon/shared'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { Configurar2faForm } from '@/features/auth/components/configurar-2fa-form'
import { authConsultas, destinoDaSessao } from '@/features/auth/queries'

export const Route = createFileRoute('/configurar-2fa')({
  beforeLoad: async ({ context }) => {
    const sessao = await context.queryClient.ensureQueryData(authConsultas.sessao())
    if (sessao === null) throw redirect({ to: '/login' })
  },
  component: Configurar2faPagina,
})

function Configurar2faPagina() {
  const router = useRouter()
  const seguir = (s: SessaoResposta) => router.history.push(destinoDaSessao(s.estado, undefined) ?? '/login')
  return (
    <AuthLayout
      titulo="Ative a verificação em duas etapas"
      descricao="Proteja a sua conta com um aplicativo autenticador."
    >
      <Configurar2faForm aoConcluir={seguir} />
    </AuthLayout>
  )
}
