import { createFileRoute, useRouteContext } from '@tanstack/react-router'
import { KeyValueGrid } from '@/components/display/key-value-grid'
import { ROTULOS_PERFIL } from '@/lib/rotulos'

export const Route = createFileRoute('/_app/perfil/')({
  component: Conta,
})

function Conta() {
  const { sessao } = useRouteContext({ from: '/_app' })
  const usuario = sessao.usuario
  if (!usuario) return null
  return (
    <section aria-label="Conta" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Estes dados são mantidos pela administração.</p>
      <KeyValueGrid
        itens={[
          { rotulo: 'Nome', valor: usuario.nome },
          { rotulo: 'Login', valor: usuario.login },
          { rotulo: 'Perfil', valor: ROTULOS_PERFIL[usuario.perfil] },
          { rotulo: 'E-mail', valor: usuario.email ?? '—' },
          { rotulo: 'Telefone', valor: usuario.telefone ?? '—' },
        ]}
      />
    </section>
  )
}
