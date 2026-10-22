import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { authConsultas } from '@/features/auth/queries'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const sessao = await context.queryClient.ensureQueryData(authConsultas.sessao())
    if (sessao === null) throw redirect({ to: '/login', search: { redirect: location.href } })
    if (sessao.estado === 'TROCA_SENHA') throw redirect({ to: '/trocar-senha' })
    if (sessao.estado === 'CADASTRO_MFA') throw redirect({ to: '/configurar-2fa' })
    return { sessao }
  },
  component: AppPagina,
})

function AppPagina() {
  return <Outlet />
}
