import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'
import { ErrorState } from '@/components/feedback/error-state'
import { SessoesTable } from '@/features/perfil/components/sessoes-table'
import { sessoesConsulta, useEncerrarOutras, useRevogarSessao } from '@/features/perfil/queries'
import { ErroApi } from '@/lib/api'

export const Route = createFileRoute('/_app/perfil/sessoes')({
  component: Sessoes,
})

function Sessoes() {
  const consulta = useQuery(sessoesConsulta())
  const revogar = useRevogarSessao()
  const encerrarOutras = useEncerrarOutras()
  if (consulta.isError) return <ErrorState erro={consulta.error} aoTentarNovamente={() => void consulta.refetch()} />
  if (!consulta.data) return <p className="text-sm text-muted-foreground">Carregando…</p>
  const sessoes = consulta.data
  const avisarErro = (e: unknown) => toast.error(e instanceof ErroApi ? e.message : 'Não foi possível encerrar.')

  return (
    <SessoesTable
      sessoes={sessoes}
      ocupado={revogar.isPending || encerrarOutras.isPending}
      aoEncerrar={(s) =>
        revogar.mutate(s.id, { onSuccess: () => toast.success('Sessão encerrada'), onError: avisarErro })
      }
      aoEncerrarOutras={() =>
        encerrarOutras.mutate(sessoes, {
          onSuccess: () => toast.success('As outras sessões foram encerradas'),
          onError: avisarErro,
        })
      }
    />
  )
}
