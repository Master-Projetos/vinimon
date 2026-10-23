import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import type { SessaoResposta } from '@vinimon/shared'
import { AuthLayout } from '@/features/auth/components/auth-layout'
import { TrocarSenhaForm } from '@/features/auth/components/trocar-senha-form'
import { authConsultas, destinoDaSessao } from '@/features/auth/queries'

export const Route = createFileRoute('/trocar-senha')({
  beforeLoad: async ({ context }) => {
    const sessao = await context.queryClient.ensureQueryData(authConsultas.sessao())
    if (sessao === null) throw redirect({ to: '/login' })
    return { sessao }
  },
  component: TrocarSenhaPagina,
})

function TrocarSenhaPagina() {
  const { sessao } = Route.useRouteContext()
  const router = useRouter()
  const seguir = (s: SessaoResposta) => router.history.push(destinoDaSessao(s.estado, undefined) ?? '/login')
  return (
    <AuthLayout titulo="Troque a sua senha" descricao="Por segurança, defina uma nova senha antes de continuar.">
      <TrocarSenhaForm login={sessao.usuario?.login} aoTrocar={seguir} />
    </AuthLayout>
  )
}
