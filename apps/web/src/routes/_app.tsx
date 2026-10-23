import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { OfflineIndicator } from '@/components/layout/offline-indicator'
import { authConsultas } from '@/features/auth/queries'
import { usePresencaAtividade } from '@/features/presenca/hooks'
import { criarSocketReal, iniciarTempoReal, type TempoReal } from '@/lib/socket'

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
  const queryClient = useQueryClient()
  const router = useRouter()
  const [tempoReal, setTempoReal] = useState<TempoReal | null>(null)

  // Conecta ao entrar na área logada e desconecta ao sair dela. Os filhos só montam depois, para que os
  // hooks de tempo real (`useSocketEvento`) já encontrem a conexão.
  useEffect(() => {
    const t = iniciarTempoReal({
      socket: criarSocketReal(),
      queryClient,
      irParaLogin: () => void router.navigate({ to: '/login' }),
    })
    setTempoReal(t)
    return () => {
      t.encerrar()
      setTempoReal(null)
    }
  }, [queryClient, router])

  if (tempoReal === null) return null
  return <AppComTempoReal />
}

function AppComTempoReal() {
  usePresencaAtividade()
  return (
    <AppShell>
      <Outlet />
      <OfflineIndicator />
    </AppShell>
  )
}
