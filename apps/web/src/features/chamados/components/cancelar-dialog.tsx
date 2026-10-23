import { CancelarChamadoSchema, type ChamadoDetalhe } from '@vinimon/shared'
import { CampoForm } from '@/components/form/campo-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { aplicarErrosDoServidor, useZodForm } from '@/lib/form'
import { temErroDeCampos, useCancelarChamado } from '../queries'

const FormCancelar = CancelarChamadoSchema.omit({ versao: true })

export interface CancelarDialogProps {
  detalhe: ChamadoDetalhe
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
}

/** Cancelar o chamado (sai dos indicadores de SLA e de avaliação). O motivo é obrigatório. */
export function CancelarDialog({ detalhe, aberto, aoMudarAberto }: CancelarDialogProps) {
  const cancelar = useCancelarChamado(detalhe.id)
  const form = useZodForm(FormCancelar, { defaultValues: { motivo: '' } })
  const { control, handleSubmit, setError, reset } = form

  function fechar(proximo: boolean) {
    if (!proximo) reset()
    aoMudarAberto(proximo)
  }

  const enviar = handleSubmit(async (valores) => {
    try {
      await cancelar.mutateAsync({ versao: detalhe.versao, motivo: valores.motivo })
      fechar(false)
    } catch (erro) {
      if (temErroDeCampos(erro)) aplicarErrosDoServidor(setError, erro)
    }
  })

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent>
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Cancelar chamado</DialogTitle>
            <DialogDescription>Esta ação fica registrada no histórico do chamado.</DialogDescription>
          </DialogHeader>
          <CampoForm control={control} name="motivo" rotulo="Motivo do cancelamento" obrigatorio>
            {(field, controle) => (
              <Textarea
                {...field}
                id={controle.id}
                aria-invalid={controle['aria-invalid']}
                aria-describedby={controle['aria-describedby']}
              />
            )}
          </CampoForm>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => fechar(false)}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={cancelar.isPending}>
              Cancelar chamado
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
