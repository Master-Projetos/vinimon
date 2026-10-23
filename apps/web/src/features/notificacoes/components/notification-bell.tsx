import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { NotificacaoDTOSchema, type PresencaPropria, preferenciaPadrao } from '@vinimon/shared'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { presencaChaves } from '@/features/presenca/queries'
import { useSocketEvento } from '@/hooks/use-socket-evento'
import { apresentarNotificacao } from '../desktop'
import {
  gravarContagem,
  notificacaoConsultas,
  useContagemNotificacoes,
  useMarcarLida,
  useMarcarTodasLidas,
  usePreferenciasNotificacao,
} from '../queries'
import { DesktopNotificationsPrompt } from './desktop-notifications-prompt'
import { NotificationItem } from './notification-item'

/** Sino da barra superior: contador, últimas notificações, marcar todas como lidas e prompt do desktop. */
export function NotificationBell() {
  const queryClient = useQueryClient()
  const naoLidas = useContagemNotificacoes()
  const preferencias = usePreferenciasNotificacao()
  const lista = useInfiniteQuery(notificacaoConsultas.lista('todas'))
  const marcar = useMarcarLida()
  const marcarTodas = useMarcarTodasLidas()
  const itens = lista.data?.pages.flatMap((p) => p.itens).slice(0, 10) ?? []

  useSocketEvento('notificacao:contagem', ({ naoLidas: n }) => gravarContagem(queryClient, n))
  useSocketEvento('notificacao:nova', ({ notificacao, naoLidas: n }) => {
    gravarContagem(queryClient, n)
    const lido = NotificacaoDTOSchema.safeParse(notificacao)
    if (!lido.success) return
    const dto = lido.data
    const propria = queryClient.getQueryData<PresencaPropria>(presencaChaves.propria)
    void apresentarNotificacao(dto, {
      comFoco: () => document.visibilityState === 'visible' && document.hasFocus(),
      ocupado: propria?.manual === 'OCUPADO',
      desktopLigado: (tipo) => {
        const salva = preferencias?.itens.find((i) => i.tipo === tipo)
        if (salva) return salva.inApp && salva.desktop
        const padrao = preferenciaPadrao(tipo, 'USUARIO')
        return padrao.inapp && padrao.desktop
      },
      toast: (mensagem) => toast(mensagem),
      Notificacao: typeof Notification === 'undefined' ? undefined : Notification,
      locks: typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined,
    })
  })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
          className="relative flex size-8 items-center justify-center rounded-md hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Bell aria-hidden="true" className="size-5" />
          {naoLidas > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive-solid px-1 text-[10px] leading-none font-medium text-white"
            >
              {naoLidas > 99 ? '99+' : naoLidas}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-2 p-2">
        <div className="flex items-center justify-between px-2">
          <p className="text-sm font-semibold">Notificações</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={naoLidas === 0 || marcarTodas.isPending}
            onClick={() => marcarTodas.mutate()}
          >
            Marcar todas como lidas
          </Button>
        </div>
        <div className="flex max-h-96 flex-col overflow-y-auto">
          {itens.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {lista.isPending ? 'Carregando…' : 'Nenhuma notificação.'}
            </p>
          ) : (
            itens.map((n) => (
              <NotificationItem
                key={n.id}
                notificacao={n}
                aoAbrir={(item) => {
                  if (!item.lida) marcar.mutate(item)
                }}
              />
            ))
          )}
        </div>
        <DesktopNotificationsPrompt />
      </PopoverContent>
    </Popover>
  )
}
