import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  type AtualizarMeSchema,
  authApi,
  type DefinirPresenca,
  meApi,
  presencaApi,
  type SessaoResposta,
} from '@vinimon/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { KbdShortcut } from '@/components/display/kbd-shortcut'
import { PresenceIndicator } from '@/components/display/presence-indicator'
import { UserAvatar, type UsuarioAvatar } from '@/components/display/user-avatar'
import { type Densidade, useDensidade } from '@/components/theme/density-provider'
import { type Tema, useTheme } from '@/components/theme/theme-provider'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { authChaves } from '@/features/auth/queries'
import { useSocketEvento } from '@/hooks/use-socket-evento'
import { chamar, definirCsrf } from '@/lib/api'
import { ROTULOS_PRESENCA } from '@/lib/rotulos'
import { tempoRealAtual } from '@/lib/socket'
import { limparDadosDoUsuario } from '@/lib/storage'
import { type PresencaDoUsuario, presencaChaves, usePresencaPropria } from '../queries'

/** Entrada do PATCH /me (antes das transformações do schema). */
type AtualizarMeEntrada = z.input<typeof AtualizarMeSchema>

export interface UserMenuProps {
  usuario: UsuarioAvatar
}

const UMA_HORA_MS = 60 * 60_000

const TEMAS_LOCAIS: ReadonlyArray<{ valor: Tema; rotulo: string; api: NonNullable<AtualizarMeEntrada['tema']> }> = [
  { valor: 'claro', rotulo: 'Claro', api: 'CLARO' },
  { valor: 'escuro', rotulo: 'Escuro', api: 'ESCURO' },
  { valor: 'sistema', rotulo: 'Sistema', api: 'SISTEMA' },
]

const DENSIDADES_LOCAIS: ReadonlyArray<{
  valor: Densidade
  rotulo: string
  api: NonNullable<AtualizarMeEntrada['densidade']>
}> = [
  { valor: 'confortavel', rotulo: 'Confortável', api: 'CONFORTAVEL' },
  { valor: 'compacta', rotulo: 'Compacta', api: 'COMPACTA' },
]

// Mesmos atalhos "g <letra>" da app bar (app-shell.tsx) e a busca da barra superior.
const ATALHOS: ReadonlyArray<{ teclas: string[]; descricao: string }> = [
  { teclas: ['mod', 'K'], descricao: 'Pesquisar' },
  { teclas: ['g', 'a'], descricao: 'Ir para Atividade' },
  { teclas: ['g', 'c'], descricao: 'Ir para Chamados' },
  { teclas: ['g', 'p'], descricao: 'Ir para o Painel' },
  { teclas: ['g', 'b'], descricao: 'Ir para a Base de conhecimento' },
  { teclas: ['g', 'i'], descricao: 'Ir para o Inventário' },
  { teclas: ['g', 'r'], descricao: 'Ir para Relatórios' },
  { teclas: ['g', 'd'], descricao: 'Ir para a Administração' },
]

/** Fim do dia no fuso do navegador (23:59:59.999 local), em ISO com `Z`. "Hoje" depende do relógio de quem usa. */
export function fimDoDia(agora: Date): string {
  const fim = new Date(agora)
  fim.setHours(23, 59, 59, 999)
  return fim.toISOString()
}

function temaValido(valor: string): Tema | null {
  return TEMAS_LOCAIS.find((t) => t.valor === valor)?.valor ?? null
}

function densidadeValida(valor: string): Densidade | null {
  return DENSIDADES_LOCAIS.find((d) => d.valor === valor)?.valor ?? null
}

function descreverManual(presenca: PresencaDoUsuario | null): string | null {
  if (!presenca?.manual) return null
  const rotulo = ROTULOS_PRESENCA[presenca.manual]
  if (!presenca.ate) return `${rotulo} até você mudar`
  const hora = new Date(presenca.ate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  return `${rotulo} até ${hora}`
}

export function UserMenu({ usuario }: UserMenuProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { tema, definirTema } = useTheme()
  const { densidade, definirDensidade } = useDensidade()
  const presenca = usePresencaPropria()
  const [atalhosAbertos, setAtalhosAbertos] = useState(false)

  const aoPresencaPropria = (p: PresencaDoUsuario): void => {
    queryClient.setQueryData(presencaChaves.propria, p)
  }
  useSocketEvento('presenca:propria', aoPresencaPropria)

  const definirPresenca = useMutation({
    mutationFn: (body: DefinirPresenca) => chamar(presencaApi.definir, { body }),
    onSuccess: (p) => aoPresencaPropria({ ...p, ate: p.ate ? p.ate.toISOString() : null }),
    onError: (erro) => toast.error('Não foi possível mudar o status', { description: erro.message }),
  })

  const atualizarPerfil = useMutation({
    mutationFn: (body: AtualizarMeEntrada) => chamar(meApi.atualizar, { body }),
    onSuccess: (atualizado) =>
      queryClient.setQueryData<SessaoResposta | null>(authChaves.sessao, (s) =>
        s ? { ...s, usuario: atualizado } : s,
      ),
    onError: (erro) => toast.error('Não foi possível salvar a preferência', { description: erro.message }),
  })

  const sair = useMutation({
    mutationFn: async () => {
      try {
        await chamar(authApi.sair, {})
      } catch {
        // Sem rede ou sessão já inválida: a limpeza local abaixo acontece de qualquer forma.
      }
    },
    onSettled: async () => {
      tempoRealAtual()?.encerrar()
      definirCsrf(null)
      limparDadosDoUsuario()
      await navigate({ to: '/login' })
      queryClient.clear()
    },
  })

  const estado = presenca?.estado ?? 'OFFLINE'
  const manual = descreverManual(presenca)
  const mudarPresenca = (body: DefinirPresenca) => definirPresenca.mutate(body)
  const ocupadoAte = (ate: string | null) => mudarPresenca({ estado: 'OCUPADO', ate })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Menu do usuário, ${usuario.nome}`}
          className="flex items-center gap-1 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <UserAvatar usuario={usuario} tamanho="sm" />
          <PresenceIndicator status={estado} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            {usuario.nome}
            <span role="status" aria-live="polite" className="block text-xs font-normal text-muted-foreground">
              {manual ?? 'Status automático'}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Status</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => mudarPresenca({ estado: null, ate: null })}>Disponível</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ocupadoAte(new Date(Date.now() + UMA_HORA_MS).toISOString())}>
            Ocupado · 1 h
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ocupadoAte(fimDoDia(new Date()))}>Ocupado · hoje</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ocupadoAte(null)}>Ocupado · até eu mudar</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => mudarPresenca({ estado: 'AUSENTE', ate: null })}>Ausente</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => mudarPresenca({ estado: null, ate: null })}>Redefinir</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/perfil">Meu perfil</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Tema</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={tema}
            onValueChange={(valor) => {
              const novo = TEMAS_LOCAIS.find((t) => t.valor === temaValido(valor))
              if (!novo) return
              definirTema(novo.valor)
              atualizarPerfil.mutate({ tema: novo.api })
            }}
          >
            {TEMAS_LOCAIS.map((t) => (
              <DropdownMenuRadioItem key={t.valor} value={t.valor}>
                {t.rotulo}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Densidade</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={densidade}
            onValueChange={(valor) => {
              const nova = DENSIDADES_LOCAIS.find((d) => d.valor === densidadeValida(valor))
              if (!nova) return
              definirDensidade(nova.valor)
              atualizarPerfil.mutate({ densidade: nova.api })
            }}
          >
            {DENSIDADES_LOCAIS.map((d) => (
              <DropdownMenuRadioItem key={d.valor} value={d.valor}>
                {d.rotulo}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setAtalhosAbertos(true)}>Atalhos de teclado</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => sair.mutate()}>Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={atalhosAbertos} onOpenChange={setAtalhosAbertos}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atalhos de teclado</DialogTitle>
            <DialogDescription>Teclas para navegar sem o mouse.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2 text-sm">
            {ATALHOS.map((a) => (
              <li key={a.descricao} className="flex items-center justify-between gap-4">
                <span>{a.descricao}</span>
                <KbdShortcut teclas={a.teclas} />
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
