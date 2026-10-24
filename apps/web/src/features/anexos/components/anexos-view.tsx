import { useQuery } from '@tanstack/react-query'
import type { Anexo, ChamadoDetalhe, Perfil } from '@vinimon/shared'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { EmptyState } from '@/components/feedback/empty-state'
import { ErrorState } from '@/components/feedback/error-state'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { metaConsultas } from '@/features/meta/queries'
import { ErroApi } from '@/lib/api'
import { anexosConsultas, useEnviarAnexos, useExcluirAnexo } from '../queries'
import { AnexoCard } from './anexo-card'
import { AnexoPreviewDialog } from './anexo-preview-dialog'

export interface AnexosViewProps {
  detalhe: ChamadoDetalhe
  perfil: Perfil
}

/** Aba Anexos: grade de cards, dropzone e, para a equipe, o toggle "Interno" (S70, S71). */
export function AnexosView({ detalhe, perfil }: AnexosViewProps) {
  const chamadoId = detalhe.id
  const lista = useQuery(anexosConsultas.lista(chamadoId))
  const meta = useQuery(metaConsultas.tudo()).data
  const enviar = useEnviarAnexos(chamadoId)
  const excluir = useExcluirAnexo(chamadoId)
  const [interno, setInterno] = useState(false)
  const [progresso, setProgresso] = useState<number | null>(null)
  const [erro, setErro] = useState<ErroApi | null>(null)
  const [previa, setPrevia] = useState<Anexo | null>(null)
  const [paraExcluir, setParaExcluir] = useState<Anexo | null>(null)
  const podeAnexar = meta?.config['anexos.habilitados'] === true && detalhe.acoes.anexar

  function subir(arquivos: File[]) {
    if (arquivos.length === 0) return
    setErro(null)
    setProgresso(0)
    enviar.mutate(
      { arquivos, interno: detalhe.acoes.comentarInterno && interno, aoProgresso: setProgresso },
      {
        onError: (e) => {
          if (e instanceof ErroApi) setErro(e)
          else toast.error('Não foi possível enviar os anexos.')
        },
        onSettled: () => setProgresso(null),
      },
    )
  }

  if (lista.isError) return <ErrorState erro={lista.error} aoTentarNovamente={() => void lista.refetch()} />
  const anexos = lista.data ?? []

  return (
    <section aria-label="Anexos do chamado" className="flex flex-col gap-4 p-4">
      {podeAnexar ? (
        <div className="flex flex-col gap-3">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              subir([...e.dataTransfer.files])
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground hover:bg-accent/40"
          >
            <span>Arraste arquivos aqui ou clique para escolher</span>
            <input
              type="file"
              multiple
              className="sr-only"
              aria-label="Anexar arquivos"
              disabled={enviar.isPending}
              onChange={(e) => {
                subir([...(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
          </label>
          {detalhe.acoes.comentarInterno ? (
            <div className="flex items-center gap-2">
              <Switch id="anexo-interno" checked={interno} onCheckedChange={setInterno} />
              <Label htmlFor="anexo-interno">Interno (só a equipe vê)</Label>
            </div>
          ) : null}
          {progresso !== null ? (
            <p role="status" className="text-sm text-muted-foreground">
              Enviando… {progresso}%
            </p>
          ) : null}
          {erro ? (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <p>{erro.message}</p>
              {erro.detalhes.length > 0 ? (
                <ul className="list-disc pl-5">
                  {erro.detalhes.map((d) => (
                    <li key={`${d.campo}-${d.mensagem}`}>{d.mensagem}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {lista.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando anexos…</p>
      ) : anexos.length === 0 ? (
        <EmptyState
          icone={Paperclip}
          titulo="Nenhum anexo"
          descricao="Os arquivos enviados neste chamado aparecem aqui."
          compacto
        />
      ) : (
        <ul aria-label="Anexos" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {anexos.map((a) => (
            <AnexoCard
              key={a.id}
              anexo={a}
              podeExcluir={perfil === 'ADMIN'}
              aoPrevisualizar={setPrevia}
              aoExcluir={setParaExcluir}
            />
          ))}
        </ul>
      )}

      <AnexoPreviewDialog anexo={previa} aoFechar={() => setPrevia(null)} />
      <ConfirmDialog
        aberto={paraExcluir !== null}
        aoMudarAberto={(aberto) => !aberto && setParaExcluir(null)}
        titulo="Excluir anexo?"
        descricao={`O arquivo "${paraExcluir?.nomeOriginal ?? ''}" será removido do chamado.`}
        rotuloConfirmar="Excluir"
        destrutivo
        aoConfirmar={async () => {
          const alvo = paraExcluir
          if (!alvo) return
          try {
            await excluir.mutateAsync(alvo.id)
            toast.success('Anexo excluído')
          } catch (e) {
            toast.error(e instanceof ErroApi ? e.message : 'Não foi possível excluir o anexo.')
          } finally {
            setParaExcluir(null)
          }
        }}
      />
    </section>
  )
}
