import { useQuery } from '@tanstack/react-query'
import { type ChamadoDetalhe, chamadosApi } from '@vinimon/shared'
import { CircleCheck, RotateCcw, UserCheck, XCircle } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { ConfirmDialog } from '@/components/feedback/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { chamar } from '@/lib/api'
import { metaConsulta, useAcaoChamado } from '../queries'
import { OperadorSelect } from './operador-select'

export interface QuickActionsRailProps {
  detalhe: ChamadoDetalhe
  usuarioId: number
}

const ROTULOS_PAPEL_PARTICIPANTE: Record<ChamadoDetalhe['participantes'][number]['papel'], string> = {
  SOLICITANTE: 'Solicitante',
  OPERADOR: 'Operador',
  SEGUIDOR: 'Seguidor',
}

const CLASSE_SELECT =
  'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'

function Campo({ rotulo, htmlFor, children }: { rotulo: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-muted-foreground">
        {rotulo}
      </Label>
      {children}
    </div>
  )
}

function Leitura({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm break-words">{valor ?? '—'}</dd>
    </div>
  )
}

interface TextoDialogProps {
  aberto: boolean
  aoMudarAberto: (v: boolean) => void
  titulo: string
  rotulo: string
  rotuloConfirmar: string
  minimo: number
  pendente: boolean
  aoConfirmar: (texto: string) => void
}

/** Diálogo com um texto obrigatório (solução, justificativa ou motivo). */
function TextoDialog({
  aberto,
  aoMudarAberto,
  titulo,
  rotulo,
  rotuloConfirmar,
  minimo,
  pendente,
  aoConfirmar,
}: TextoDialogProps) {
  const [texto, setTexto] = useState('')
  const idCampo = useId()
  const valido = texto.trim().length >= minimo
  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) setTexto('')
        aoMudarAberto(v)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>Esta ação fica registrada no histórico do chamado.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={idCampo}>{rotulo}</Label>
          <Textarea id={idCampo} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => aoMudarAberto(false)}>
            Voltar
          </Button>
          <Button type="button" disabled={!valido || pendente} onClick={() => aoConfirmar(texto.trim())}>
            {rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type DialogoAberto = 'concluir' | 'reabrir' | 'cancelar' | 'trocar' | null

/**
 * Trilho de propriedades e ações (§6.3 item 6). Cada controle só aparece editável quando `detalhe.acoes.*`
 * permite; toda mutação envia a `versao` do detalhe em cache. Ficam para tarefas seguintes: encaminhar para
 * outra área, agendar e editar classificação/tags.
 */
export function QuickActionsRail({ detalhe, usuarioId }: QuickActionsRailProps) {
  const { id, versao, acoes } = detalhe
  const idStatus = useId()
  const idPrioridade = useId()
  const idOperador = useId()
  const [dialogo, setDialogo] = useState<DialogoAberto>(null)
  const meta = useQuery(metaConsulta())

  const status = useAcaoChamado(id, (statusId: number) =>
    chamar(chamadosApi.status, { params: { id }, body: { versao, statusId } }),
  )
  const prioridade = useAcaoChamado(id, (prioridadeId: number) =>
    chamar(chamadosApi.prioridade, { params: { id }, body: { versao, prioridadeId } }),
  )
  const encaminhar = useAcaoChamado(id, (operadorId: number) =>
    chamar(chamadosApi.encaminhar, { params: { id }, body: { versao, areaId: detalhe.area.id, operadorId } }),
  )
  const assumir = useAcaoChamado(id, (confirmarTroca: boolean) =>
    chamar(chamadosApi.assumir, { params: { id }, body: { versao, ...(confirmarTroca ? { confirmarTroca } : {}) } }),
  )
  const concluir = useAcaoChamado(id, (solucao: string) =>
    chamar(chamadosApi.concluir, { params: { id }, body: { versao, solucao } }),
  )
  const reabrir = useAcaoChamado(id, (justificativa: string) =>
    chamar(chamadosApi.reabrir, { params: { id }, body: { versao, justificativa } }),
  )
  const cancelar = useAcaoChamado(id, (motivo: string) =>
    chamar(chamadosApi.cancelar, { params: { id }, body: { versao, motivo } }),
  )

  const statusEditaveis = (meta.data?.status ?? []).filter(
    (s) => s.tipo === 'ABERTO' || s.tipo === 'EM_ATENDIMENTO' || s.tipo === 'PENDENTE',
  )
  const prioridades = meta.data?.prioridades ?? []
  const fechar = () => setDialogo(null)
  const trocaDeOperador = detalhe.operador !== null && detalhe.operador.id !== usuarioId

  return (
    <div className="flex flex-col gap-5 p-4">
      <section aria-label="Propriedades" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Propriedades</h2>
        {acoes.status ? (
          <Campo rotulo="Status" htmlFor={idStatus}>
            <select
              id={idStatus}
              className={CLASSE_SELECT}
              value={detalhe.status.id}
              disabled={status.isPending}
              onChange={(e) => status.mutate(Number(e.target.value))}
            >
              {statusEditaveis.some((s) => s.id === detalhe.status.id) ? null : (
                <option value={detalhe.status.id}>{detalhe.status.nome}</option>
              )}
              {statusEditaveis.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </Campo>
        ) : null}
        {acoes.prioridade ? (
          <Campo rotulo="Prioridade" htmlFor={idPrioridade}>
            <select
              id={idPrioridade}
              className={CLASSE_SELECT}
              value={detalhe.prioridade.id}
              disabled={prioridade.isPending}
              onChange={(e) => prioridade.mutate(Number(e.target.value))}
            >
              {prioridades.some((p) => p.id === detalhe.prioridade.id) ? null : (
                <option value={detalhe.prioridade.id}>{detalhe.prioridade.nome}</option>
              )}
              {prioridades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
        ) : null}
        {acoes.encaminhar ? (
          <Campo rotulo="Operador" htmlFor={idOperador}>
            <OperadorSelect
              id={idOperador}
              operador={detalhe.operador}
              desabilitado={encaminhar.isPending}
              aoEscolher={(operadorId) => encaminhar.mutate(operadorId)}
            />
          </Campo>
        ) : null}
        <dl className="flex flex-col gap-2">
          {acoes.status ? null : <Leitura rotulo="Status" valor={detalhe.status.nome} />}
          {acoes.prioridade ? null : <Leitura rotulo="Prioridade" valor={detalhe.prioridade.nome} />}
          {acoes.encaminhar ? null : <Leitura rotulo="Operador" valor={detalhe.operador?.nome} />}
          <Leitura rotulo="Área" valor={detalhe.area.nome} />
          <Leitura rotulo="Tipo de problema" valor={detalhe.problema?.nome} />
          <Leitura rotulo="Departamento" valor={detalhe.departamento?.nome} />
          <Leitura rotulo="Ativo" valor={detalhe.ativo?.etiqueta} />
          {detalhe.tags ? (
            <Leitura
              rotulo="Tags"
              valor={detalhe.tags.length > 0 ? detalhe.tags.map((t) => t.nome).join(', ') : null}
            />
          ) : null}
        </dl>
      </section>

      <section aria-label="Ações" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Ações</h2>
        {acoes.assumir ? (
          <Button
            type="button"
            variant="outline"
            disabled={assumir.isPending}
            onClick={() => (trocaDeOperador ? setDialogo('trocar') : assumir.mutate(false))}
          >
            <UserCheck aria-hidden="true" />
            Assumir
          </Button>
        ) : null}
        {acoes.concluir ? (
          <Button type="button" variant="outline" onClick={() => setDialogo('concluir')}>
            <CircleCheck aria-hidden="true" />
            Concluir
          </Button>
        ) : null}
        {acoes.reabrir ? (
          <Button type="button" variant="outline" onClick={() => setDialogo('reabrir')}>
            <RotateCcw aria-hidden="true" />
            Reabrir
          </Button>
        ) : null}
        {acoes.cancelar ? (
          <Button type="button" variant="outline" onClick={() => setDialogo('cancelar')}>
            <XCircle aria-hidden="true" />
            Cancelar chamado
          </Button>
        ) : null}
        {!(acoes.assumir || acoes.concluir || acoes.reabrir || acoes.cancelar) ? (
          <p className="text-sm text-muted-foreground">Nenhuma ação disponível.</p>
        ) : null}
      </section>

      <section aria-label="Participantes" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Participantes</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {detalhe.participantes.map((p) => (
            <li key={`${p.id}-${p.papel}`} className="flex items-baseline justify-between gap-2">
              <span className="truncate">{p.nome}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{ROTULOS_PAPEL_PARTICIPANTE[p.papel]}</span>
            </li>
          ))}
        </ul>
      </section>

      <ConfirmDialog
        aberto={dialogo === 'trocar'}
        aoMudarAberto={(v) => !v && fechar()}
        titulo="Assumir este chamado?"
        descricao={`${detalhe.operador?.nome ?? 'Outra pessoa'} é a responsável atual. O chamado passará para você e ela será avisada.`}
        rotuloConfirmar="Assumir"
        aoConfirmar={() => {
          fechar()
          assumir.mutate(true)
        }}
      />
      <TextoDialog
        aberto={dialogo === 'concluir'}
        aoMudarAberto={(v) => !v && fechar()}
        titulo="Concluir chamado"
        rotulo="Solução aplicada"
        rotuloConfirmar="Concluir"
        minimo={1}
        pendente={concluir.isPending}
        aoConfirmar={(t) => {
          fechar()
          concluir.mutate(t)
        }}
      />
      <TextoDialog
        aberto={dialogo === 'reabrir'}
        aoMudarAberto={(v) => !v && fechar()}
        titulo="Reabrir chamado"
        rotulo="Justificativa"
        rotuloConfirmar="Reabrir"
        minimo={5}
        pendente={reabrir.isPending}
        aoConfirmar={(t) => {
          fechar()
          reabrir.mutate(t)
        }}
      />
      <TextoDialog
        aberto={dialogo === 'cancelar'}
        aoMudarAberto={(v) => !v && fechar()}
        titulo="Cancelar chamado"
        rotulo="Motivo do cancelamento"
        rotuloConfirmar="Cancelar chamado"
        minimo={5}
        pendente={cancelar.isPending}
        aoConfirmar={(t) => {
          fechar()
          cancelar.mutate(t)
        }}
      />
    </div>
  )
}
