import type { ChamadoDetalhe } from '@vinimon/shared'
import { Bell, BellOff, Check, Link2, SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { AvatarGroup } from '@/components/display/avatar-group'
import { PrioridadeBadge } from '@/components/display/prioridade-badge'
import { SlaBadge } from '@/components/display/sla-badge'
import { StatusBadge } from '@/components/display/status-badge'
import type { UsuarioAvatar } from '@/components/display/user-avatar'
import { PaneHeader } from '@/components/layout/pane-header'
import { Button } from '@/components/ui/button'
import { useCopiar } from '@/hooks/use-copiar'
import { useSeguirChamado } from '../queries'

export interface ChamadoHeaderProps {
  detalhe: ChamadoDetalhe
  /** Abas (RouteTabs) na faixa abaixo do título. */
  abas: ReactNode
  /** Quando definido, mostra o botão "Propriedades" (trilho em Sheet abaixo de xl). */
  aoAbrirPropriedades?: () => void
}

/** Solicitante, operador e participantes, sem repetir pessoas. */
export function pessoasDoChamado(detalhe: ChamadoDetalhe): UsuarioAvatar[] {
  const todas: UsuarioAvatar[] = [detalhe.solicitante]
  if (detalhe.operador) todas.push(detalhe.operador)
  for (const p of detalhe.participantes) todas.push({ id: p.id, nome: p.nome })
  const vistos = new Set<number>()
  return todas.filter((u) => (vistos.has(u.id) ? false : (vistos.add(u.id), true)))
}

export function ChamadoHeader({ detalhe, abas, aoAbrirPropriedades }: ChamadoHeaderProps) {
  const seguir = useSeguirChamado(detalhe.id)
  const { copiado, copiar } = useCopiar()
  const SeguirIcone = detalhe.seguindo ? BellOff : Bell

  async function copiarLink() {
    const ok = await copiar(`${window.location.origin}/chamados/${detalhe.id}`)
    if (ok) toast.success('Link copiado')
    else toast.error('Não foi possível copiar o link')
  }

  return (
    <section aria-label="Cabeçalho do chamado" className="flex flex-col">
      <PaneHeader
        voltarPara={{ to: '/chamados' }}
        titulo={
          <>
            <span className="font-mono text-muted-foreground">#{detalhe.id}</span> {detalhe.assunto}
          </>
        }
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge nome={detalhe.status.nome} cor={detalhe.status.cor} />
            <PrioridadeBadge nome={detalhe.prioridade.nome} cor={detalhe.prioridade.cor} />
            <SlaBadge sla={{ ...detalhe.sla.solucao, cancelado: detalhe.cancelado }} />
          </span>
        }
        acoes={
          <>
            <AvatarGroup usuarios={pessoasDoChamado(detalhe)} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={seguir.isPending}
              onClick={() => seguir.mutate(!detalhe.seguindo)}
            >
              <SeguirIcone aria-hidden="true" />
              {detalhe.seguindo ? 'Deixar de seguir' : 'Seguir'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Copiar link"
              onClick={() => void copiarLink()}
            >
              {copiado ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
            </Button>
            {aoAbrirPropriedades ? (
              <Button type="button" variant="outline" size="sm" onClick={aoAbrirPropriedades}>
                <SlidersHorizontal aria-hidden="true" />
                Propriedades
              </Button>
            ) : null}
          </>
        }
        abaixo={abas}
      />
    </section>
  )
}
