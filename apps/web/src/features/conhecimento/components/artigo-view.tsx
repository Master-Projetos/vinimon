import { Link, useRouteContext } from '@tanstack/react-router'
import type { Artigo } from '@vinimon/shared'
import { Pencil, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { Markdown } from '@/components/display/markdown'
import { Pode } from '@/components/display/pode'
import { PaneHeader } from '@/components/layout/pane-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatarData } from '@/lib/datas'
import { ROTULOS_SITUACAO_ARTIGO } from '@/lib/rotulos'
import { useVotarArtigo } from '../queries'

export interface ArtigoViewProps {
  artigo: Artigo
}

/** Artigo em `.markdown-artigo`, com "Foi útil?" e "Abrir chamado" já apontando para o problema do artigo. */
export function ArtigoView({ artigo }: ArtigoViewProps) {
  const { sessao } = useRouteContext({ from: '/_app' })
  const perfil = sessao.usuario?.perfil
  const votar = useVotarArtigo(artigo.id)
  const [votou, setVotou] = useState(false)
  const problemaId = artigo.problemaIds[0]

  return (
    <article className="flex min-h-0 flex-1 flex-col">
      <PaneHeader
        titulo={artigo.titulo}
        voltarPara={{ to: '/conhecimento' }}
        acoes={
          perfil ? (
            <Pode perfil={perfil} permissao="conhecimento.gerenciar">
              <Button asChild variant="outline" size="sm">
                <Link to="/conhecimento/$artigoId/editar" params={{ artigoId: artigo.id }}>
                  <Pencil aria-hidden="true" /> Editar
                </Link>
              </Button>
            </Pode>
          ) : null
        }
      />
      <div className="mx-auto w-full max-w-3xl space-y-4 overflow-y-auto p-(--pane-px)">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {artigo.visibilidade === 'INTERNO' ? <Badge variant="secondary">Interno</Badge> : null}
          {artigo.situacao !== 'PUBLICADO' ? (
            <Badge variant="outline">{ROTULOS_SITUACAO_ARTIGO[artigo.situacao]}</Badge>
          ) : null}
          <span>Atualizado em {formatarData(artigo.atualizadoEm)}</span>
        </div>
        {artigo.resumo ? <p className="text-muted-foreground">{artigo.resumo}</p> : null}
        <Markdown texto={artigo.conteudo} className="markdown markdown-artigo" />
        <footer className="flex flex-wrap items-center gap-3 border-t pt-4">
          {votou ? (
            <p role="status" className="text-sm">
              Obrigado pelo retorno!
            </p>
          ) : (
            <fieldset className="flex items-center gap-2">
              <legend className="float-left mr-2 text-sm font-medium">Foi útil?</legend>
              {([true, false] as const).map((util) => (
                <Button
                  key={String(util)}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={votar.isPending}
                  onClick={() => votar.mutate(util, { onSuccess: () => setVotou(true) })}
                >
                  {util ? <ThumbsUp aria-hidden="true" /> : <ThumbsDown aria-hidden="true" />}
                  {util ? 'Sim' : 'Não'}
                </Button>
              ))}
            </fieldset>
          )}
          <Button asChild variant="secondary" size="sm" className="ml-auto">
            <Link to="/chamados/novo" search={problemaId === undefined ? {} : { problema: problemaId }}>
              Abrir chamado
            </Link>
          </Button>
        </footer>
      </div>
    </article>
  )
}
