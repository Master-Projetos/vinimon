import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { DoisFatoresCard } from '@/features/perfil/components/dois-fatores-card'
import { TrocarSenhaCard } from '@/features/perfil/components/trocar-senha-card'

export const Route = createFileRoute('/_app/perfil/seguranca')({
  component: Seguranca,
})

function Seguranca() {
  const { sessao } = useRouteContext({ from: '/_app' })
  const usuario = sessao.usuario
  if (!usuario) return null
  return (
    <div className="flex flex-col gap-6">
      <TrocarSenhaCard login={usuario.login} />
      <DoisFatoresCard mfaAtivo={usuario.mfaAtivo} perfil={usuario.perfil} />
    </div>
  )
}
