import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { DENSIDADES, type DefinirPresenca, type PresencaPropria, TEMAS } from '@vinimon/shared'
import { toast } from 'sonner'
import { PresenceIndicator } from '@/components/display/presence-indicator'
import { UserAvatar, type UsuarioAvatar } from '@/components/display/user-avatar'
import { type Densidade, useDensidade } from '@/components/theme/density-provider'
import { type Tema, useTheme } from '@/components/theme/theme-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSair } from '@/features/auth/queries'
import { useSocketEvento } from '@/hooks/use-socket-evento'
import { ErroApi } from '@/lib/api'
import { usePresenca } from '../hooks'
import { presencaChaves, useAtualizarPreferencias, useDefinirPresenca } from '../queries'

const ROTULOS_TEMA: Record<Tema, string> = { claro: 'Claro', escuro: 'Escuro', sistema: 'Sistema' }
const ROTULOS_DENSIDADE: Record<Densidade, string> = { confortavel: 'Confortável', compacta: 'Compacta' }

export interface UserMenuProps {
  usuario: UsuarioAvatar
  /** Abre o diálogo de atalhos (T-10.17). Sem ele, o item fica desabilitado. */
  aoAbrirAtalhos?: () => void
}

/** Até o fim do dia local, como ISO com deslocamento. */
function fimDoDia(agora: Date): string {
  const fim = new Date(agora)
  fim.setHours(23, 59, 59, 0)
  return fim.toISOString()
}

/** Menu do avatar da barra superior (§6.2): presença, perfil, tema, densidade, atalhos e sair. */
export function UserMenu({ usuario, aoAbrirAtalhos }: UserMenuProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { tema, definirTema } = useTheme()
  const { densidade, definirDensidade } = useDensidade()
  const definirPresenca = useDefinirPresenca()
  const preferencias = useAtualizarPreferencias()
  const sair = useSair()
  const presencas = usePresenca([usuario.id])
  const estado = presencas[usuario.id] ?? 'OFFLINE'

  // O servidor confirma o estado próprio (manual, prazo ou inatividade) por este evento.
  useSocketEvento('presenca:propria', (propria) => {
    queryClient.setQueryData<PresencaPropria>(presencaChaves.propria, {
      estado: propria.estado,
      manual: propria.manual,
      ate: propria.ate === null ? null : new Date(propria.ate),
    })
  })

  function escolher(body: DefinirPresenca) {
    definirPresenca.mutate(body, {
      onError: (e) => toast.error(e instanceof ErroApi ? e.message : 'Não foi possível mudar o status.'),
    })
  }

  function trocarTema(valor: string) {
    const escolhido = TEMAS.find((t) => t === valor)
    if (!escolhido) return
    definirTema(escolhido)
    preferencias.mutate({ tema: escolhido })
  }

  function trocarDensidade(valor: string) {
    const escolhida = DENSIDADES.find((d) => d === valor)
    if (!escolhida) return
    definirDensidade(escolhida === 'COMPACTA' ? 'compacta' : 'confortavel')
    preferencias.mutate({ densidade: escolhida })
  }

  function aoSair() {
    sair.mutate(undefined, { onSettled: () => void navigate({ to: '/login' }) })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <span aria-hidden="true">
          <UserAvatar usuario={usuario} tamanho="sm" />
          <span className="absolute -right-1 -bottom-1 rounded-full bg-background text-[10px] leading-none">
            <PresenceIndicator status={estado} />
          </span>
        </span>
        <span className="sr-only">Menu de {usuario.nome}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span className="truncate">{usuario.nome}</span>
          <PresenceIndicator status={estado} />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Status</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => escolher({ estado: null, ate: null })}>Disponível</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => escolher({ estado: 'OCUPADO', ate: new Date(Date.now() + 3_600_000).toISOString() })}
        >
          Ocupado · 1 h
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => escolher({ estado: 'OCUPADO', ate: fimDoDia(new Date()) })}>
          Ocupado · hoje
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => escolher({ estado: 'OCUPADO', ate: null })}>
          Ocupado · até eu mudar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => escolher({ estado: 'AUSENTE', ate: null })}>Ausente</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => escolher({ estado: null, ate: null })}>Redefinir status</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: '/perfil' })}>Meu perfil</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Tema</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={tema === 'sistema' ? 'SISTEMA' : tema.toUpperCase()} onValueChange={trocarTema}>
          {TEMAS.map((t) => (
            <DropdownMenuRadioItem key={t} value={t}>
              {ROTULOS_TEMA[t.toLowerCase() as Tema]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Densidade</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={densidade.toUpperCase()} onValueChange={trocarDensidade}>
          {DENSIDADES.map((d) => (
            <DropdownMenuRadioItem key={d} value={d}>
              {ROTULOS_DENSIDADE[d.toLowerCase() as Densidade]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!aoAbrirAtalhos} onSelect={() => aoAbrirAtalhos?.()}>
          Atalhos de teclado
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={aoSair}>Sair</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
