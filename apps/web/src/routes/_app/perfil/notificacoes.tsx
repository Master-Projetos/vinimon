import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/feedback/error-state'
import { Button } from '@/components/ui/button'
import { notificacaoConsultas } from '@/features/notificacoes/queries'
import {
  type LinhaPreferencia,
  PreferenciasNotificacaoTable,
} from '@/features/perfil/components/preferencias-notificacao-table'
import { useSalvarPreferenciasNotificacao } from '@/features/perfil/queries'
import { ErroApi } from '@/lib/api'

export const Route = createFileRoute('/_app/perfil/notificacoes')({
  component: Notificacoes,
})

type Permissao = NotificationPermission | 'indisponivel'
const lerPermissao = (): Permissao => (typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission)

const ROTULOS_PERMISSAO: Record<Permissao, string> = {
  granted: 'Permitidas neste navegador.',
  denied: 'Bloqueadas neste navegador. Libere nas configurações do navegador para receber avisos.',
  default: 'Ainda não ativadas neste navegador.',
  indisponivel: 'Este navegador não oferece notificações na área de trabalho.',
}

function Notificacoes() {
  const consulta = useQuery(notificacaoConsultas.preferencias())
  const salvar = useSalvarPreferenciasNotificacao()
  const [rascunho, setRascunho] = useState<LinhaPreferencia[] | null>(null)
  const [permissao, setPermissao] = useState<Permissao>(lerPermissao)

  if (consulta.isError) return <ErrorState erro={consulta.error} aoTentarNovamente={() => void consulta.refetch()} />
  if (!consulta.data) return <p className="text-sm text-muted-foreground">Carregando…</p>
  const itens = rascunho ?? consulta.data.itens

  function aoSalvar() {
    salvar.mutate(
      { itens: itens.map(({ tipo, inApp, desktop }) => ({ tipo, inApp, desktop })) },
      {
        onSuccess: () => {
          setRascunho(null)
          toast.success('Preferências salvas')
        },
        onError: (e) => toast.error(e instanceof ErroApi ? e.message : 'Não foi possível salvar.'),
      },
    )
  }

  function testar() {
    try {
      new Notification('Vinimon', {
        body: 'As notificações na área de trabalho estão funcionando.',
        icon: '/icon-192.png',
      })
    } catch {
      toast.error('Este navegador não permitiu mostrar a notificação.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="titulo-permissao" className="flex flex-col gap-2">
        <h2 id="titulo-permissao" className="text-sm font-semibold">
          Área de trabalho
        </h2>
        <p className="text-sm text-muted-foreground">{ROTULOS_PERMISSAO[permissao]}</p>
        <div className="flex gap-2">
          {permissao === 'default' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void Notification.requestPermission().then(setPermissao)}
            >
              Ativar
            </Button>
          ) : null}
          {permissao === 'granted' ? (
            <Button type="button" variant="outline" size="sm" onClick={testar}>
              Testar
            </Button>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="titulo-matriz" className="flex flex-col gap-3">
        <h2 id="titulo-matriz" className="text-sm font-semibold">
          O que avisar
        </h2>
        <PreferenciasNotificacaoTable itens={itens} aoMudar={setRascunho} />
        <div className="flex justify-end">
          <Button type="button" disabled={rascunho === null || salvar.isPending} onClick={aoSalvar}>
            Salvar preferências
          </Button>
        </div>
      </section>
    </div>
  )
}
